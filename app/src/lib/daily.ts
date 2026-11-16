/** Daily Case: shared types and helpers (safe for client and server). */

export type Answer = "A" | "B" | "jury";
export type Side = "A" | "B";

/** A row of the case bank, as the admin sees it. */
export type BankCase = {
  id: string;
  title: string;
  story: string;
  side_a_who: string;
  side_a: string;
  side_b_who: string;
  side_b: string;
  clues: string[];
  answer: Answer;
  explanation: string | null;
  category: string;
  source: "bank" | "user";
  source_key: string | null;
  source_case_id: string | null;
  review_flags: string[];
  status: "draft" | "approved";
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

export type BankCaseInput = Pick<
  BankCase,
  "title" | "story" | "side_a_who" | "side_a" | "side_b_who" | "side_b" | "clues" | "answer" | "explanation" | "category"
>;

/** What players see. `reveal` is only filled in once they've picked (or the day is over). */
export type DailyCase = {
  day: string;
  number: number;
  today: boolean;
  title: string;
  story: string;
  sideA: { who: string; text: string };
  sideB: { who: string; text: string };
  /** Empty while locked (signed out); clueCount still says how many are waiting. */
  clues: string[];
  clueCount: number;
  /** Signed out: the teaser only (title, story, sides). Sign in to see clues and play. */
  locked: boolean;
  category: string;
  /** How the answer is decided: a known answer, a real Rest My Case jury, or today's verified players. */
  basis: "known" | "case_jury" | "players";
  /** Link to the original Rest My Case case (user cases only). */
  caseUrl: string | null;
  reveal: Reveal | null;
};

export type Reveal = {
  /** The answer, or null while today's players are still deciding (or it's a tie). */
  answer: Side | null;
  final: boolean;
  explanation: string | null;
  tally: { a: number; b: number };
  myPick: Side | null;
};

export const MAX_CLUES = 8;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** UTC calendar day, e.g. "2026-11-16". */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isDay(s: string): boolean {
  return DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && utcDay(new Date(`${s}T00:00:00Z`)) === s;
}

/** "Mon 16 Nov 2026" */
export function formatDay(day: string, opts: { year?: boolean } = {}): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: opts.year === false ? undefined : "numeric",
    timeZone: "UTC",
  });
}

/** Majority of a tally, or null for a tie / no votes. */
export function majority(t: { a: number; b: number }): Side | null {
  return t.a === t.b ? null : t.a > t.b ? "A" : "B";
}

/** Wordle-style share text. `cluesSeen` = clues showing when they locked in. */
export function shareText(c: DailyCase, pick: Side, cluesSeen: number, url: string): string {
  const squares = c.clueCount ? Array.from({ length: c.clueCount }, (_, i) => (i < cluesSeen ? "🟨" : "⬛")).join("") : "";
  const who = pick === "A" ? c.sideA.who : c.sideB.who;
  const answer = c.reveal?.answer ?? null;
  const lines = [`⚖️ Rest My Case · Case of the Day #${c.number}`, `“${c.title}”`, ""];
  if (answer && (c.reveal?.final || c.basis !== "players")) {
    const right = answer === pick;
    lines.push(
      right
        ? `✅ Called it${c.clueCount ? ` with ${cluesSeen} of ${c.clueCount} clues` : ""}`
        : `❌ Got it wrong${c.clueCount ? ` with ${cluesSeen} of ${c.clueCount} clues` : ""}`,
    );
  } else {
    lines.push(`🗳️ I sided with ${who}. Verdict at midnight UTC.`);
  }
  if (squares) lines.push(squares);
  lines.push("", `Who's right? ${url}`);
  return lines.join("\n");
}

/** The signed-out teaser: no clues, no answer. */
export function lockedView<T extends DailyCase>(v: T): T {
  return { ...v, clues: [], locked: true, reveal: null };
}
