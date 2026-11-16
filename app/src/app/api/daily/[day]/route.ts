import { isDay, utcDay, type Side } from "@/lib/daily";
import { network } from "@/lib/network";
import { dailyView } from "@/lib/server/daily";
import { bad } from "@/lib/server/http";
import { verifiedPerson } from "@/lib/server/person";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";

const noStore = { headers: { "cache-control": "no-store" } };

/** The Daily Case for a UTC day. Works signed out; signed in and verified, it includes your saved pick. */
export async function GET(request: Request, ctx: RouteContext<"/api/daily/[day]">) {
  const { day } = await ctx.params;
  if (!isDay(day)) return bad("Bad date.");
  const user = await authenticate(request);
  const person = user ? (await verifiedPerson(user.wallets))?.person ?? null : null;
  const view = await dailyView(day, { person });
  if (!view) return bad(day > utcDay() ? "No peeking at future cases." : "No case that day.", 404);
  return Response.json({ ...view, counted: Boolean(person) }, noStore);
}

/**
 * Lock in a pick: { vote: "A" | "B", clue: number }. Free. Saved (one per verified person, final) only for
 * today's case; anyone else just gets the reveal back.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/daily/[day]">) {
  const { day } = await ctx.params;
  if (!isDay(day)) return bad("Bad date.");
  const { vote, clue } = ((await request.json().catch(() => ({}))) ?? {}) as { vote?: string; clue?: number };
  if (vote !== "A" && vote !== "B") return bad("Pick a side.");
  const clueN = Number.isInteger(clue) && clue! >= 0 && clue! <= 20 ? clue! : 0;

  const user = await authenticate(request);
  const person = user ? (await verifiedPerson(user.wallets))?.person ?? null : null;
  if (person && user && day === utcDay()) {
    const { error } = await db()
      .from("daily_votes")
      .insert({ network: network.name, day, person, privy_user_id: user.userId, vote, clue: clueN });
    // 23505: already picked today. Their first pick stands; the view below returns it.
    if (error && error.code !== "23505") return bad("Couldn't save your pick. Try again.", 500);
  }
  const view = await dailyView(day, { person, myPick: vote as Side });
  if (!view) return bad("No case that day.", 404);
  return Response.json({ ...view, counted: Boolean(person && day === utcDay()) }, noStore);
}
