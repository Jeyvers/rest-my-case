import { network } from "@/lib/network";
import { parseBankInput } from "@/lib/server/bankInput";
import { isAdmin } from "@/lib/server/daily";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";

/** Admin: every case in the bank, plus which days already ran on this network. */
export async function GET(request: Request) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  const [{ data: cases, error }, { data: slots }] = await Promise.all([
    db().from("case_bank").select("*").order("created_at", { ascending: false }),
    db().from("daily_slots").select("day, case_id").eq("network", network.name).order("day", { ascending: false }).limit(400),
  ]);
  if (error) return bad("Couldn't load the case bank. Has migration 0013 been run?", 500);
  return Response.json({ cases, slots }, { headers: { "cache-control": "no-store" } });
}

/** Admin: add a case. New cases start as drafts. */
export async function POST(request: Request) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  const parsed = parseBankInput(await request.json().catch(() => null), false);
  if ("error" in parsed) return bad(parsed.error);
  const { data, error } = await db()
    .from("case_bank")
    .insert({ ...parsed.data, source: "bank", status: "draft" })
    .select("*")
    .single();
  if (error?.code === "23505") return bad("Another case is already scheduled for that day.", 409);
  if (error) return bad("Couldn't save the case.", 500);
  return Response.json({ case: data });
}
