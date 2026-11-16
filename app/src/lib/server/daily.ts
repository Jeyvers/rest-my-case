import "server-only";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { sameAddress, ZERO_ADDRESS, type ChainCase } from "@/lib/cases";
import { majority, utcDay, type BankCase, type DailyCase, type Side } from "@/lib/daily";
import type { FeedItem } from "@/lib/crowd";
import { dataKey, network } from "@/lib/network";
import { redactForFeature } from "@/lib/textRules";
import { publicClient, readCase } from "./chain";
import { feedPage } from "./feed";
import { notifyWallet } from "./notify";
import type { AuthedUser } from "./privy";
import { db } from "./supabase";

const NET = network.name;

/* ------------------------------------------------------------------ admin */

let ownerCache: { at: number; owner: string } | null = null;

/**
 * Admins: the wallets in ADMIN_WALLETS (comma-separated) if set, otherwise the RestMyCase contract's owner.
 * Set ADMIN_WALLETS when the owner moves to a multisig you can't sign in with.
 */
export async function isAdmin(user: AuthedUser | null): Promise<boolean> {
  if (!user) return false;
  const listed = (process.env.ADMIN_WALLETS ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  if (listed.length) return user.wallets.some((w) => listed.includes(w.toLowerCase()));
  if (!network.restMyCase) return false;
  if (!ownerCache || Date.now() - ownerCache.at > 10 * 60_000) {
    const owner = await publicClient.readContract({ address: network.restMyCase, abi: restMyCaseAbi, functionName: "owner" });
    ownerCache = { at: Date.now(), owner };
  }
  return user.wallets.some((w) => sameAddress(w, ownerCache!.owner));
}

/* -------------------------------------------------------------- scheduler */

type Slot = { day: string; case_id: string };

/**
 * The case for a UTC day. Today's slot is filled on first ask (the keeper also asks every minute, so it fills at
 * 00:00 UTC): the case pinned to today, else the next approved unused case (user cases first, oldest first, then
 * bank cases), else the approved case shown least recently. Past days only return what actually ran; future days
 * return nothing. Null only when the bank has no approved case at all.
 */
export async function caseForDay(day: string): Promise<{ row: BankCase; number: number } | null> {
  const today = utcDay();
  if (day > today) return null;

  let { data: slot } = await db().from("daily_slots").select("day, case_id").eq("network", NET).eq("day", day).maybeSingle<Slot>();
  if (!slot && day === today) slot = await fillSlot(day);
  if (!slot) return null;

  const [{ data: row }, { count }] = await Promise.all([
    db().from("case_bank").select("*").eq("id", slot.case_id).single<BankCase>(),
    db().from("daily_slots").select("day", { count: "exact", head: true }).eq("network", NET).lte("day", day),
  ]);
  return row ? { row, number: count ?? 1 } : null;
}

async function fillSlot(day: string): Promise<Slot | null> {
  const pick = await pickCase(day);
  if (!pick) return null;
  const { error } = await db().from("daily_slots").insert({ network: NET, day, case_id: pick.id });
  // Lost a race to another request: someone else filled it; use theirs.
  const { data: slot } = await db().from("daily_slots").select("day, case_id").eq("network", NET).eq("day", day).maybeSingle<Slot>();
  if (!error && slot?.case_id === pick.id && pick.source === "user") await announceFeatured(pick, day);
  return slot ?? null;
}

async function pickCase(day: string): Promise<BankCase | null> {
  const { data: pinned } = await db()
    .from("case_bank")
    .select("*")
    .eq("status", "approved")
    .eq("scheduled_date", day)
    .maybeSingle<BankCase>();
  if (pinned) return pinned;

  const [{ data: approved }, { data: slots }] = await Promise.all([
    db().from("case_bank").select("*").eq("status", "approved").order("created_at", { ascending: true }).returns<BankCase[]>(),
    db().from("daily_slots").select("day, case_id").eq("network", NET).order("day", { ascending: false }).returns<Slot[]>(),
  ]);
  // Never take a case pinned to a later day.
  const free = (approved ?? []).filter((c) => !c.scheduled_date || c.scheduled_date < day);
  if (!free.length) return null;

  const lastShown = new Map<string, string>();
  for (const s of slots ?? []) if (!lastShown.has(s.case_id)) lastShown.set(s.case_id, s.day);
  const unused = free.filter((c) => !lastShown.has(c.id));
  const next = unused.find((c) => c.source === "user") ?? unused.find((c) => c.source === "bank");
  if (next) return next;

  // Everything has run: reuse the one shown longest ago.
  return [...free].sort((a, b) => (lastShown.get(a.id) ?? "").localeCompare(lastShown.get(b.id) ?? ""))[0];
}

async function announceFeatured(c: BankCase, day: string): Promise<void> {
  if (c.source_key !== dataKey || !c.source_case_id) return; // from an older contract: can't look up the parties
  const caseId = BigInt(c.source_case_id);
  const chain = await readCase(caseId).catch(() => null);
  if (!chain) return;
  for (const party of [chain.partyA, chain.partyB]) {
    if (party === ZERO_ADDRESS) continue;
    await notifyWallet("featured", caseId, party, {
      title: "🌟 Your case is today's Case of the Day",
      body: `Case #${caseId} is featured on Rest My Case today. See how everyone judges it.`,
      url: `/daily/${day}`,
      cta: "See it",
    });
  }
}

/* ----------------------------------------------------------- player view */

export type DailyVoteRow = { person: string; vote: Side; clue: number };

export async function dailyTally(day: string): Promise<{ a: number; b: number; rows: DailyVoteRow[] }> {
  const { data } = await db().from("daily_votes").select("person, vote, clue").eq("network", NET).eq("day", day).returns<DailyVoteRow[]>();
  const rows = data ?? [];
  return { a: rows.filter((r) => r.vote === "A").length, b: rows.filter((r) => r.vote === "B").length, rows };
}

/**
 * What a player sees. The answer is included once they've picked (myPick passed in) or the day is over; for
 * 'jury' cases it's today's verified majority, final at midnight UTC.
 */
export async function dailyView(day: string, opts: { myPick?: Side | null; person?: string | null } = {}): Promise<DailyCase | null> {
  const found = await caseForDay(day);
  if (!found) return null;
  const { row, number } = found;
  const today = day === utcDay();
  const tally = await dailyTally(day);
  const stored = opts.person ? tally.rows.find((r) => r.person === opts.person)?.vote ?? null : null;
  const myPick = stored ?? opts.myPick ?? null;
  const final = !today;
  const basis = row.answer === "jury" ? "players" : row.source === "user" ? "case_jury" : "known";
  const show = final || Boolean(myPick);

  return {
    day,
    number,
    today,
    title: row.title,
    story: row.story,
    sideA: { who: row.side_a_who, text: row.side_a },
    sideB: { who: row.side_b_who, text: row.side_b },
    clues: row.clues ?? [],
    clueCount: (row.clues ?? []).length,
    locked: false,
    category: row.category,
    basis,
    caseUrl: row.source === "user" && row.source_key === dataKey ? `/c/${row.source_case_id}` : null,
    reveal: show
      ? {
          answer: row.answer === "jury" ? majority(tally) : (row.answer as Side),
          final: row.answer === "jury" ? final : true,
          explanation: row.explanation,
          tally: { a: tally.a, b: tally.b },
          myPick,
        }
      : null,
  };
}

/* ------------------------------------------------------------ hot right now */

/** The most active live user case (most crowd votes + comments), or null when no case is live. */
export async function hotCase(): Promise<FeedItem | null> {
  const { items } = await feedPage({ limit: 20, viewer: null });
  const live = items.filter((i) => i.status >= 2 && i.status <= 4);
  if (!live.length) return null;
  const score = (i: FeedItem) => i.crowdTotal + (i.comments ?? 0);
  return live.reduce((best, i) => (score(i) > score(best) ? i : best));
}

/* --------------------------------------------------- feature a user's case */

export type FeatureState = {
  /** Verdict is in, so the case can be put forward. */
  eligible: boolean;
  /** Wallets that must agree (both parties, or just A for a one-sided case). */
  needed: string[];
  agreed: string[];
  /** Where the copy is in the case bank. */
  stage: "none" | "draft" | "approved" | "scheduled" | "featured";
  featuredOn: string | null;
};

async function bankRowFor(caseId: bigint): Promise<BankCase | null> {
  const { data } = await db()
    .from("case_bank")
    .select("*")
    .eq("source", "user")
    .eq("source_key", dataKey)
    .eq("source_case_id", caseId.toString())
    .maybeSingle<BankCase>();
  return data ?? null;
}

export async function featureState(caseId: bigint, c: ChainCase): Promise<FeatureState> {
  const needed = [c.partyA, c.partyB].filter((p) => p !== ZERO_ADDRESS).map((p) => p.toLowerCase());
  const [{ data: consents }, row] = await Promise.all([
    db().from("feature_consents").select("wallet").eq("network", dataKey).eq("case_id", caseId.toString()),
    bankRowFor(caseId),
  ]);
  let stage: FeatureState["stage"] = row ? (row.status === "approved" ? "approved" : "draft") : "none";
  let featuredOn: string | null = null;
  if (row) {
    const { data: slots } = await db()
      .from("daily_slots")
      .select("day")
      .eq("network", NET)
      .eq("case_id", row.id)
      .lte("day", utcDay())
      .order("day", { ascending: true })
      .limit(1);
    featuredOn = slots?.[0]?.day ?? null;
    if (featuredOn) stage = "featured";
    else if (row.scheduled_date && row.status === "approved") stage = "scheduled";
  }
  return {
    eligible: c.status === 5,
    needed,
    agreed: (consents ?? []).map((r) => r.wallet).filter((w) => needed.includes(w)),
    stage,
    featuredOn,
  };
}

/** Records a party's consent. Once every party has agreed, copies the case into the bank as a draft. */
export async function consentToFeature(caseId: bigint, c: ChainCase, wallet: string): Promise<void> {
  await db()
    .from("feature_consents")
    .upsert({ network: dataKey, case_id: caseId.toString(), wallet: wallet.toLowerCase() }, { ignoreDuplicates: true });
  const state = await featureState(caseId, c);
  if (state.stage !== "none" || !state.needed.every((w) => state.agreed.includes(w))) return;

  const { data: sides } = await db()
    .from("sides")
    .select("role, body, title, content_hash")
    .eq("network", dataKey)
    .eq("case_id", caseId.toString());
  const a = sides?.find((s) => s.role === "A" && sameAddress(s.content_hash, c.contentA));
  const b = sides?.find((s) => s.role === "B" && sameAddress(s.content_hash, c.contentB));
  if (!a) throw new Error("This case's text isn't available.");
  const oneSided = c.mode === 1;

  const flags: string[] = [];
  const clean = (s: string, where: string) => {
    const r = redactForFeature(s);
    flags.push(...r.flags.map((f) => `${where}: ${f}`));
    return r.text;
  };
  const title = clean(a.title || `Case #${caseId}`, "Title");
  const tally = `${Math.max(c.votesA, c.votesB)}–${Math.min(c.votesA, c.votesB)}`;
  const row = oneSided
    ? {
        story: clean(a.body, "Story"),
        side_a_who: "They're right",
        side_a: "The person telling the story is in the right.",
        side_b_who: "They're wrong",
        side_b: "The person telling the story is in the wrong.",
      }
    : {
        story: "Two people disagree. Each wrote their side. Who's right?",
        side_a_who: "Side A",
        side_a: clean(a.body, "Side A"),
        side_b_who: "Side B",
        side_b: clean(b?.body ?? "", "Side B"),
      };
  if (!oneSided) flags.push("Two-sided case: consider writing a short neutral story and better labels than “Side A/B”.");

  const { error } = await db()
    .from("case_bank")
    .insert({
      title: title.slice(0, 80),
      ...row,
      clues: [],
      answer: c.verdict === 1 ? "A" : "B",
      explanation: `A real Rest My Case jury decided this ${tally}.`,
      category: "real case",
      source: "user",
      source_key: dataKey,
      source_case_id: caseId.toString(),
      review_flags: flags,
      status: "draft",
    });
  if (error && error.code !== "23505") throw new Error("Couldn't send it for review. Try again.");
}

/** Withdraws a party's consent and pulls the copy from the bank, unless it's already scheduled or has run. */
export async function withdrawFeature(caseId: bigint, c: ChainCase, wallet: string): Promise<string | null> {
  const state = await featureState(caseId, c);
  if (state.stage === "scheduled" || state.stage === "featured") return "It's already scheduled, so it can't be withdrawn now.";
  const row = await bankRowFor(caseId);
  if (row) {
    const { count } = await db().from("daily_slots").select("day", { count: "exact", head: true }).eq("case_id", row.id);
    if (count) return "It's already been picked as a Daily Case, so it can't be withdrawn now.";
    await db().from("case_bank").delete().eq("id", row.id);
  }
  await db().from("feature_consents").delete().eq("network", dataKey).eq("case_id", caseId.toString()).eq("wallet", wallet.toLowerCase());
  return null;
}
