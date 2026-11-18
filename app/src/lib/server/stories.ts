import "server-only";
import { network } from "@/lib/network";
import type { ReactionCounts, ReactionKey, StoryCard, StoryPart, StoryTag, StoryThread } from "@/lib/stories";
import { db } from "./supabase";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NET = () => network.name;

type Row = {
  id: string;
  author_user_id: string;
  title: string;
  tags: StoryTag[];
  status: "live" | "hidden";
  reads: number;
  r_wow: number;
  r_heart: number;
  r_laugh: number;
  r_flag: number;
  report_count: number;
  created_at: string;
};
const CARD_COLS = "id, title, tags, status, reads, r_wow, r_heart, r_laugh, r_flag, report_count, created_at";

const day = (ts: string) => ts.slice(0, 10);
const counts = (r: Pick<Row, "r_wow" | "r_heart" | "r_laugh" | "r_flag">): ReactionCounts => ({
  wow: r.r_wow,
  heart: r.r_heart,
  laugh: r.r_laugh,
  flag: r.r_flag,
});

/** The feed: live stories, newest or most-read, optionally one tag. Public: never includes who wrote it. */
export async function listStories(opts: { sort: "new" | "top"; tag?: StoryTag | null; limit?: number; before?: string | null }) {
  let q = db().from("ex_stories").select(CARD_COLS).eq("network", NET()).eq("status", "live");
  if (opts.tag) q = q.contains("tags", [opts.tag]);
  if (opts.sort === "new" && opts.before) q = q.lt("created_at", opts.before);
  q = opts.sort === "top" ? q.order("reads", { ascending: false }).order("created_at", { ascending: false }) : q.order("created_at", { ascending: false });
  const { data, error } = await q.limit(opts.limit ?? 30);
  if (error) throw error;
  const rows = (data ?? []) as Omit<Row, "author_user_id">[];
  if (!rows.length) return { items: [] as StoryCard[], next: null };
  const { data: parts } = await db().from("ex_story_parts").select("story_id, idx, body").in("story_id", rows.map((r) => r.id));
  const byStory = new Map<string, { idx: number; body: string }[]>();
  for (const p of parts ?? []) byStory.set(p.story_id, [...(byStory.get(p.story_id) ?? []), p]);
  const items: StoryCard[] = rows.map((r) => {
    const ps = (byStory.get(r.id) ?? []).sort((a, b) => a.idx - b.idx);
    return { id: r.id, title: r.title, tags: r.tags, day: day(r.created_at), opening: ps[0]?.body ?? "", parts: ps.length, reads: r.reads, reactions: counts(r) };
  });
  const last = rows[rows.length - 1];
  return { items, next: opts.sort === "new" && rows.length === (opts.limit ?? 30) ? last.created_at : null };
}

async function row(id: string): Promise<Row | null> {
  if (!UUID.test(id)) return null;
  const { data } = await db().from("ex_stories").select(`${CARD_COLS}, author_user_id`).eq("id", id).eq("network", NET()).maybeSingle();
  return (data as Row | null) ?? null;
}

/** A story's whole thread. Hidden stories are visible only to their author (and the admin routes). */
export async function getThread(id: string, viewer: string | null, opts: { admin?: boolean } = {}): Promise<StoryThread | null> {
  const r = await row(id);
  if (!r) return null;
  const mine = Boolean(viewer && viewer === r.author_user_id);
  if (r.status !== "live" && !mine && !opts.admin) return null;
  const [{ data: parts }, { data: reacts }] = await Promise.all([
    db().from("ex_story_parts").select("idx, body, created_at").eq("story_id", id).order("idx"),
    viewer
      ? db().from("ex_story_reactions").select("emoji").eq("story_id", id).eq("user_id", viewer)
      : Promise.resolve({ data: [] as { emoji: string }[] }),
  ]);
  return {
    id: r.id,
    title: r.title,
    tags: r.tags,
    day: day(r.created_at),
    reads: r.reads,
    reactions: counts(r),
    status: r.status,
    parts: (parts ?? []).map((p): StoryPart => ({ idx: p.idx, body: p.body, day: day(p.created_at) })),
    mine,
    myReactions: (reacts ?? []).map((x) => x.emoji as ReactionKey),
  };
}

/** Stories this person posted in the last 24 hours (the daily limit). */
export async function postedToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("ex_stories").select("id", { count: "exact", head: true }).eq("author_user_id", userId).gte("created_at", since);
  return count ?? 0;
}

export async function createStory(userId: string, title: string, tags: string[], parts: string[]): Promise<string> {
  const { data, error } = await db()
    .from("ex_stories")
    .insert({ network: NET(), author_user_id: userId, title: title.trim(), tags })
    .select("id")
    .single();
  if (error) throw error;
  const { error: pe } = await db()
    .from("ex_story_parts")
    .insert(parts.map((body, i) => ({ story_id: data.id, idx: i + 1, body: body.trim() })));
  if (pe) {
    await db().from("ex_stories").delete().eq("id", data.id);
    throw pe;
  }
  return data.id;
}

/** Only the author may add to or delete their story. */
export async function authorOf(id: string): Promise<{ author: string; reports: number } | null> {
  const r = await row(id);
  return r ? { author: r.author_user_id, reports: r.report_count } : null;
}

export async function appendParts(id: string, from: number, parts: string[]) {
  const { error } = await db()
    .from("ex_story_parts")
    .insert(parts.map((body, i) => ({ story_id: id, idx: from + i, body: body.trim() })));
  if (error) throw error;
  await db().from("ex_stories").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

/** Fully removes a story (parts, reactions and reports go with it). Keeps only a content-free removal record. */
export async function deleteStory(id: string, by: "author" | "admin", hadReports: number) {
  const { error } = await db().from("ex_stories").delete().eq("id", id).eq("network", NET());
  if (error) throw error;
  await db().from("ex_story_removals").insert({ network: NET(), removed_by: by, had_reports: hadReports });
}

/** Admin: stories with reports or hidden, most reported first, with the reasons. */
export async function reportedStories() {
  const { data, error } = await db()
    .from("ex_stories")
    .select(CARD_COLS)
    .eq("network", NET())
    .or("report_count.gt.0,status.eq.hidden")
    .order("report_count", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as Omit<Row, "author_user_id">[];
  const ids = rows.map((r) => r.id);
  const { data: reports } = ids.length
    ? await db().from("ex_story_reports").select("story_id, reason, note, created_at").in("story_id", ids).order("created_at", { ascending: false })
    : { data: [] };
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    day: day(r.created_at),
    reportCount: r.report_count,
    reports: (reports ?? []).filter((x) => x.story_id === r.id).map((x) => ({ reason: x.reason, note: x.note, day: day(x.created_at) })),
  }));
}
