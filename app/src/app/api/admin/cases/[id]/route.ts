import { utcDay } from "@/lib/daily";
import { parseBankInput } from "@/lib/server/bankInput";
import { isAdmin } from "@/lib/server/daily";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Admin: edit, approve/unapprove ({ status }), schedule ({ scheduled_date: "YYYY-MM-DD" | null }).
 * A case that has already run can still be edited (fix typos) but not pulled back to draft.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/cases/[id]">) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("Bad id.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseBankInput(body, true);
  if ("error" in parsed) return bad(parsed.error);
  const update: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  if (body && "status" in body) {
    if (body.status !== "draft" && body.status !== "approved") return bad("Bad status.");
    update.status = body.status;
    update.approved_at = body.status === "approved" ? new Date().toISOString() : null;
    if (body.status === "draft") {
      const { count } = await db().from("daily_slots").select("day", { count: "exact", head: true }).eq("case_id", id);
      if (count) return bad("This case has already run as a Daily Case, so it stays approved.", 409);
    }
  }
  if (typeof parsed.data.scheduled_date === "string" && parsed.data.scheduled_date <= utcDay()) {
    return bad("Schedule it for tomorrow or later. Today's case is already set.", 409);
  }
  if (body && "review_flags" in body && Array.isArray(body.review_flags)) {
    update.review_flags = body.review_flags.filter((f): f is string => typeof f === "string").slice(0, 20);
  }

  const { data, error } = await db().from("case_bank").update(update).eq("id", id).select("*").single();
  if (error?.code === "23505") return bad("Another case is already scheduled for that day.", 409);
  if (error) return bad("Couldn't save the case.", 500);
  return Response.json({ case: data });
}

/** Admin: delete a case that has never run. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/cases/[id]">) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("Bad id.");
  const { count } = await db().from("daily_slots").select("day", { count: "exact", head: true }).eq("case_id", id);
  if (count) return bad("This case has already run, so it can't be deleted.", 409);
  const { error } = await db().from("case_bank").delete().eq("id", id);
  if (error) return bad("Couldn't delete the case.", 500);
  return Response.json({ ok: true });
}
