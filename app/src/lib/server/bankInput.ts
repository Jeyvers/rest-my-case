import "server-only";
import { isDay, MAX_CLUES, type BankCaseInput } from "@/lib/daily";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Validates an admin's case edit. Returns the clean fields, or an error message. */
export function parseBankInput(raw: unknown, partial: boolean): { data: Partial<BankCaseInput> & { scheduled_date?: string | null } } | { error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<BankCaseInput> & { scheduled_date?: string | null } = {};
  const has = (k: string) => k in b;

  const text = (k: keyof BankCaseInput, min: number, max: number, label: string): string | null => {
    if (partial && !has(k)) return null;
    const v = str(b[k]);
    if (v.length < min || v.length > max) return `${label} must be ${min}–${max} characters.`;
    (out as Record<string, unknown>)[k] = v;
    return null;
  };
  const errors = [
    text("title", 3, 80, "Title"),
    text("story", 10, 1500, "Story"),
    text("side_a_who", 1, 40, "Side A label"),
    text("side_a", 2, 1000, "Side A"),
    text("side_b_who", 1, 40, "Side B label"),
    text("side_b", 2, 1000, "Side B"),
    text("category", 2, 30, "Category"),
  ].filter(Boolean);
  if (errors.length) return { error: errors[0]! };

  if (!partial || has("answer")) {
    if (!["A", "B", "jury"].includes(String(b.answer))) return { error: "Answer must be A, B or jury." };
    out.answer = b.answer as BankCaseInput["answer"];
  }
  if (!partial || has("clues")) {
    const clues = Array.isArray(b.clues) ? b.clues.map(str).filter(Boolean) : [];
    if (clues.length > MAX_CLUES) return { error: `At most ${MAX_CLUES} clues.` };
    if (clues.some((c) => c.length > 300)) return { error: "Keep each clue under 300 characters." };
    out.clues = clues;
  }
  if (!partial || has("explanation")) {
    const e = str(b.explanation);
    if (e.length > 1000) return { error: "Keep the explanation under 1000 characters." };
    out.explanation = e || null;
  }
  if (has("scheduled_date")) {
    const d = b.scheduled_date;
    if (d === null || d === "") out.scheduled_date = null;
    else if (typeof d === "string" && isDay(d)) out.scheduled_date = d;
    else return { error: "Bad schedule date." };
  }
  return { data: out };
}
