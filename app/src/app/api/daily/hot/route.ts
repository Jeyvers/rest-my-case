import { hotCase } from "@/lib/server/daily";

export const maxDuration = 30;

/** "Hot right now": the most active live user case, or { item: null } when nothing is live. */
export async function GET() {
  const item = await hotCase().catch(() => null);
  return Response.json({ item }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
