/** Ex Stories: shared (client + server) types, limits and the identity check. */

export const STORY_TAGS = ["Cheating", "Ghosting", "Money", "Lies", "Family", "Other"] as const;
export type StoryTag = (typeof STORY_TAGS)[number];

export const REACTIONS = [
  { key: "wow", emoji: "😮" },
  { key: "heart", emoji: "💔" },
  { key: "laugh", emoji: "😂" },
  { key: "flag", emoji: "🚩" },
] as const;
export type ReactionKey = (typeof REACTIONS)[number]["key"];
export type ReactionCounts = Record<ReactionKey, number>;

export const REPORT_REASONS = [
  { key: "identifies", label: "Identifies a real person" },
  { key: "harassment", label: "Harassment or threats" },
  { key: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["key"];

export const MAX_PART = 600;
export const MAX_PARTS = 40;
export const MAX_TITLE = 80;
export const MIN_STORY = 80; // characters across the whole thread
export const STORIES_PER_DAY = 3;

export type StoryCard = {
  id: string;
  title: string;
  tags: StoryTag[];
  day: string; // YYYY-MM-DD, never a time
  opening: string; // post 1
  parts: number;
  reads: number;
  reactions: ReactionCounts;
};
export type StoryPart = { idx: number; body: string; day: string };
export type StoryThread = Omit<StoryCard, "opening" | "parts"> & {
  parts: StoryPart[];
  status: "live" | "hidden";
  mine: boolean; // the signed-in reader wrote it (never says who)
  myReactions: ReactionKey[];
};

// ---------------------------------------------------------------------------------------------------------------
// Identity check. Free and rule-based: no AI. Contact details block posting; anything that may name or place a
// person is highlighted with one-tap fixes, and the writer can keep it if it's a false alarm.

export type FindingKind = "email" | "phone" | "handle" | "link" | "address" | "name" | "workplace" | "school" | "place";
export type Finding = {
  part: number; // index into the parts array; -1 = title
  start: number;
  end: number;
  text: string;
  kind: FindingKind;
  blocking: boolean;
  message: string;
  fixes: string[]; // replacements offered, first is the default
};

const NAME_FIXES = ["X", "Mr X", "Miss X"];
const HONORIFIC = "(?:Mr|Mrs|Ms|Miss|Dr|Aunty|Auntie|Uncle|Pastor|Chief|Prof|Sir|Madam)";
// Capitalised words that are fine mid-sentence. Kept short on purpose: flags are only suggestions.
const SAFE_WORDS = new Set(
  (
    "I I'm I've I'd I'll X Mr Mrs Ms Miss God Jesus OK Okay Mum Mom Dad Mama Papa Monday Tuesday Wednesday Thursday " +
    "Friday Saturday Sunday January February March April May June July August September October November December " +
    "Christmas Easter Valentine Valentine's WhatsApp Instagram Facebook TikTok Snapchat Twitter Telegram iPhone " +
    "Netflix Google YouTube Uber Bolt English Ramadan Eid New Year Year"
  ).split(" "),
);

type Rule = { kind: FindingKind; re: RegExp; blocking: boolean; message: string; fixes: (m: string) => string[]; group?: number };

const RULES: Rule[] = [
  { kind: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, blocking: true, message: "Email address: remove it to post.", fixes: () => [""] },
  { kind: "handle", re: /(?<![\w@])@[A-Za-z0-9_.]{2,}/g, blocking: true, message: "@handle: remove it to post.", fixes: () => [""] },
  {
    kind: "link",
    re: /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|app|xyz|ng|uk|gh|ke|za)\b/gi,
    blocking: true,
    message: "Link: remove it to post.",
    fixes: () => [""],
  },
  { kind: "phone", re: /(?:\+?\d[\s().-]?){7,}\d/g, blocking: true, message: "Phone number: remove it to post.", fixes: () => [""] },
  {
    kind: "address",
    re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Close|Crescent|Lane|Drive|Way|Estate|Boulevard|Court)\b/g,
    blocking: false,
    message: "Looks like an exact address.",
    fixes: () => ["their street"],
  },
  {
    kind: "school",
    re: /\b(?:(?:[A-Z][\w'-]*\s+){1,4}(?:University|College|School|Academy|Polytechnic|Institute)|(?:University|College) of (?:[A-Z][\w'-]*\s?){1,3})/g,
    blocking: false,
    message: "Names a school.",
    fixes: (m) => [/university|polytechnic|institute|college/i.test(m) ? "a university" : "a school"],
  },
  {
    kind: "workplace",
    re: /\b(?:works?|worked|working|job|interned?)\s+(?:at|for|with)\s+((?:[A-Z][\w&'.-]*\s?){1,4})/g,
    group: 1,
    blocking: false,
    message: "Names a workplace.",
    fixes: () => ["a company"],
  },
  {
    kind: "workplace",
    re: /\b(?:[A-Z][\w&'-]*\s+){1,3}(?:Bank|Ltd|Limited|Inc|PLC|Hospital|Hotel|Group|Company|Church|Mosque)\b/g,
    blocking: false,
    message: "Names a workplace or exact place.",
    fixes: () => ["a company"],
  },
  {
    kind: "name",
    re: new RegExp(`\\b${HONORIFIC}\\.?\\s+(?!X\\b)[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?`, "g"),
    blocking: false,
    message: "Looks like a real name.",
    fixes: (m) => {
      const h = m.match(new RegExp(`^${HONORIFIC}`))?.[0];
      return h ? [`${h} X`, ...NAME_FIXES.filter((f) => f !== `${h} X`)] : NAME_FIXES;
    },
  },
  {
    kind: "name",
    re: /\b(?:named|called|name is|name's)\s+((?!X\b)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    group: 1,
    blocking: false,
    message: "Looks like a real name.",
    fixes: () => NAME_FIXES,
  },
];

// A capitalised word mid-sentence (not after . ! ? or a line start), not in SAFE_WORDS: maybe a name or a place.
const MID_CAPS = /(?<=[a-z,;:'"”)]\s+)[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?/g;

function findIn(text: string, part: number): Finding[] {
  const out: Finding[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const add = (f: Omit<Finding, "part">) => {
    if (!f.text.trim() || overlaps(f.start, f.end)) return;
    taken.push([f.start, f.end]);
    out.push({ ...f, part });
  };
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      const g = r.group ? m[r.group] : m[0];
      if (!g) continue;
      const lead = r.group ? m[0].indexOf(g) : 0;
      const raw = g.replace(/\s+$/, "");
      const start = m.index! + lead;
      add({ start, end: start + raw.length, text: raw, kind: r.kind, blocking: r.blocking, message: r.message, fixes: r.fixes(raw) });
    }
  }
  for (const m of text.matchAll(MID_CAPS)) {
    const words = m[0].split(/\s+/);
    if (words.every((w) => SAFE_WORDS.has(w))) continue;
    add({
      start: m.index!,
      end: m.index! + m[0].length,
      text: m[0],
      kind: "name",
      blocking: false,
      message: "Is this a real name or place? If so, swap it.",
      fixes: NAME_FIXES,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Every finding across the title (part -1) and the thread's posts. */
export function checkStory(title: string, parts: string[]): Finding[] {
  return [...findIn(title, -1), ...parts.flatMap((p, i) => findIn(p, i))];
}

/** Applies one fix to one piece of text. An empty fix removes the match (and a doubled space). */
export function applyFix(text: string, f: Pick<Finding, "start" | "end">, fix: string): string {
  const before = text.slice(0, f.start);
  const after = text.slice(f.end);
  return fix ? before + fix + after : (before.replace(/\s+$/, "") + " " + after.replace(/^\s+/, "")).trim();
}

/** Server-side validation for a new story or an edit. Returns an error message, or null. */
export function storyProblem(title: string, tags: string[], parts: string[]): string | null {
  const t = title.trim();
  if (t.length < 3 || t.length > MAX_TITLE) return `Give it a title (3–${MAX_TITLE} characters).`;
  if (!tags.length || tags.length > 3 || !tags.every((x) => (STORY_TAGS as readonly string[]).includes(x))) return "Pick 1 to 3 tags.";
  if (!parts.length || parts.length > MAX_PARTS) return `A thread has 1 to ${MAX_PARTS} posts.`;
  if (parts.some((p) => !p.trim() || p.length > MAX_PART)) return `Each post needs text, up to ${MAX_PART} characters.`;
  if (parts.join("").trim().length < MIN_STORY) return `Tell a bit more (at least ${MIN_STORY} characters).`;
  return blockingProblem(t, parts);
}

export function blockingProblem(title: string, parts: string[]): string | null {
  const block = checkStory(title, parts).find((f) => f.blocking);
  return block ? `${block.message.replace(/:.*$/, "")} found (“${block.text}”). Remove it to post.` : null;
}
