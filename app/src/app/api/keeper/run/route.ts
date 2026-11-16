import { timingSafeEqual } from "node:crypto";
import { utcDay } from "@/lib/daily";
import { caseForDay } from "@/lib/server/daily";
import { runKeeper } from "@/lib/server/keeper";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.KEEPER_CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** Called every minute by the Supabase scheduled job, with the cron secret. */
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runKeeper("cron");
  // Fill today's Daily Case slot right after 00:00 UTC (and send "you're featured" alerts), even if nobody visits.
  await caseForDay(utcDay()).catch(() => null);
  const body = JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  return new Response(body, { headers: { "content-type": "application/json" } });
}
