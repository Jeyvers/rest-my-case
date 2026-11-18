import { REPORT_REASONS } from "@/lib/stories";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { UUID } from "@/lib/server/stories";
import { db } from "@/lib/server/supabase";

/** Report a story: { reason, note? }. Three reports hide it until the admin reviews it. */
export async function POST(request: Request, ctx: RouteContext<"/api/stories/[id]/report">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("Story not found.", 404);
  const user = await authenticate(request);
  if (!user) return bad("Sign in to report.", 401);
  const { reason, note } = ((await request.json().catch(() => null)) ?? {}) as { reason?: string; note?: string };
  if (!REPORT_REASONS.some((r) => r.key === reason)) return bad("Pick a reason.");
  const text = typeof note === "string" ? note.trim().slice(0, 500) || null : null;
  const { error } = await db().rpc("ex_story_report", { p_story: id, p_user: user.userId, p_reason: reason, p_note: text });
  if (error) return bad("Couldn't send your report. Try again.", 500);
  return Response.json({ ok: true });
}
