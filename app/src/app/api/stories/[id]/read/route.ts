import { UUID } from "@/lib/server/stories";
import { db } from "@/lib/server/supabase";

/** Counts a read. Called once per browser session by the story page. */
export async function POST(_request: Request, ctx: RouteContext<"/api/stories/[id]/read">) {
  const { id } = await ctx.params;
  if (UUID.test(id)) await db().rpc("ex_story_read", { p_story: id });
  return Response.json({ ok: true });
}
