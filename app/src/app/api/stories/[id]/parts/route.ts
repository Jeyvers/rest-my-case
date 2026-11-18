import { blockingProblem, MAX_PART, MAX_PARTS } from "@/lib/stories";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { appendParts, authorOf, getThread } from "@/lib/server/stories";

/** The author adds to their thread: { parts: string[] }. */
export async function POST(request: Request, ctx: RouteContext<"/api/stories/[id]/parts">) {
  const { id } = await ctx.params;
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const a = await authorOf(id);
  if (!a) return bad("Story not found.", 404);
  if (a.author !== user.userId) return bad("Only the person who wrote it can add to it.", 403);
  const b = ((await request.json().catch(() => null)) ?? {}) as { parts?: unknown };
  const parts = Array.isArray(b.parts) ? b.parts.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean) : [];
  if (!parts.length) return bad("Write something to add.");
  if (parts.some((p) => p.length > MAX_PART)) return bad(`Each post can be up to ${MAX_PART} characters.`);
  const thread = await getThread(id, user.userId);
  if (!thread) return bad("Story not found.", 404);
  if (thread.parts.length + parts.length > MAX_PARTS) return bad(`A thread can have up to ${MAX_PARTS} posts.`);
  const problem = blockingProblem("", parts);
  if (problem) return bad(problem);
  try {
    await appendParts(id, thread.parts.length + 1, parts);
    return Response.json(await getThread(id, user.userId));
  } catch {
    return bad("Couldn't add that. Try again.", 500);
  }
}
