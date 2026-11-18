import { blockingProblem, MAX_PART, MAX_PARTS, MAX_TITLE } from "@/lib/stories";
import { isAdmin } from "@/lib/server/daily";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { authorOf, deleteStory, getThread } from "@/lib/server/stories";
import { db } from "@/lib/server/supabase";

/** Admin: the full thread, including a hidden one. */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/stories/[id]">) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  const thread = await getThread((await ctx.params).id, null, { admin: true });
  return thread ? Response.json(thread, { headers: { "cache-control": "no-store" } }) : bad("Story not found.", 404);
}

/**
 * Admin: edit and/or restore. { title?, parts?, status?: "live" | "hidden", clearReports?: true }.
 * Editing parts replaces the whole thread with the given posts.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/stories/[id]">) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  const { id } = await ctx.params;
  if (!(await authorOf(id))) return bad("Story not found.", 404);
  const b = ((await request.json().catch(() => null)) ?? {}) as { title?: unknown; parts?: unknown; status?: unknown; clearReports?: unknown };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.title !== undefined) {
    const t = typeof b.title === "string" ? b.title.trim() : "";
    if (t.length < 3 || t.length > MAX_TITLE) return bad(`Title must be 3–${MAX_TITLE} characters.`);
    update.title = t;
  }
  let parts: string[] | null = null;
  if (b.parts !== undefined) {
    parts = Array.isArray(b.parts) ? b.parts.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean) : [];
    if (!parts.length || parts.length > MAX_PARTS || parts.some((p) => p.length > MAX_PART)) return bad(`1–${MAX_PARTS} posts, each up to ${MAX_PART} characters.`);
  }
  const problem = blockingProblem(typeof update.title === "string" ? update.title : "", parts ?? []);
  if (problem) return bad(problem);
  if (b.status === "live" || b.status === "hidden") update.status = b.status;
  if (b.clearReports === true) {
    await db().from("ex_story_reports").delete().eq("story_id", id);
    update.report_count = 0;
  }
  if (parts) {
    const { error: de } = await db().from("ex_story_parts").delete().eq("story_id", id);
    if (de) return bad("Couldn't save the edit.", 500);
    const { error: ie } = await db().from("ex_story_parts").insert(parts.map((body, i) => ({ story_id: id, idx: i + 1, body })));
    if (ie) return bad("Couldn't save the edit.", 500);
  }
  const { error } = await db().from("ex_stories").update(update).eq("id", id);
  if (error) return bad("Couldn't save the edit.", 500);
  return Response.json(await getThread(id, null, { admin: true }));
}

/** Admin: delete for good (parts, reactions and reports go too). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/stories/[id]">) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  const { id } = await ctx.params;
  const a = await authorOf(id);
  if (!a) return bad("Story not found.", 404);
  try {
    await deleteStory(id, "admin", a.reports);
    return Response.json({ ok: true });
  } catch {
    return bad("Couldn't delete it.", 500);
  }
}
