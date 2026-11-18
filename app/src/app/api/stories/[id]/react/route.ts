import { REACTIONS } from "@/lib/stories";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { getThread, UUID } from "@/lib/server/stories";
import { db } from "@/lib/server/supabase";

/** Toggle a reaction: { emoji: "wow" | "heart" | "laugh" | "flag" }. Signed in, one of each per person. */
export async function POST(request: Request, ctx: RouteContext<"/api/stories/[id]/react">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("Story not found.", 404);
  const user = await authenticate(request);
  if (!user) return bad("Sign in to react.", 401);
  const { emoji } = ((await request.json().catch(() => null)) ?? {}) as { emoji?: string };
  if (!REACTIONS.some((r) => r.key === emoji)) return bad("Unknown reaction.");
  const thread = await getThread(id, user.userId);
  if (!thread || thread.status !== "live") return bad("Story not found.", 404);
  const { error } = await db().rpc("ex_story_react", { p_story: id, p_user: user.userId, p_emoji: emoji });
  if (error) return bad("Couldn't save that. Try again.", 500);
  const fresh = await getThread(id, user.userId);
  return Response.json({ reactions: fresh?.reactions, myReactions: fresh?.myReactions });
}
