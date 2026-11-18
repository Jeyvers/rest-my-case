import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { authorOf, deleteStory, getThread } from "@/lib/server/stories";

/** One story's thread. Signed in: also whether you wrote it and your reactions. */
export async function GET(request: Request, ctx: RouteContext<"/api/stories/[id]">) {
  const { id } = await ctx.params;
  const user = await authenticate(request);
  const thread = await getThread(id, user?.userId ?? null);
  if (!thread) return bad("Story not found.", 404);
  return Response.json(thread, { headers: { "cache-control": "no-store" } });
}

/** The author deletes their own story: fully removed. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/stories/[id]">) {
  const { id } = await ctx.params;
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const a = await authorOf(id);
  if (!a) return bad("Story not found.", 404);
  if (a.author !== user.userId) return bad("Only the person who wrote it can delete it.", 403);
  try {
    await deleteStory(id, "author", a.reports);
    return Response.json({ ok: true });
  } catch {
    return bad("Couldn't delete it. Try again.", 500);
  }
}
