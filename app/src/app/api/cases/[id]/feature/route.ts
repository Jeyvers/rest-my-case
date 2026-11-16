import { readCase } from "@/lib/server/chain";
import { consentToFeature, featureState, withdrawFeature } from "@/lib/server/daily";
import { bad, parseCaseId } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";

/**
 * "Feature as Daily Case". GET is public (it drives the Featured badge). POST: a party agrees; once every party
 * has, the case is copied into the case bank as a draft for the admin to review. DELETE: a party withdraws,
 * allowed until it's scheduled.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/cases/[id]/feature">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const c = await readCase(caseId);
  if (c.status === 0) return bad("Case not found.", 404);
  const state = await featureState(caseId, c);
  const user = await authenticate(request);
  const mine = user ? state.needed.filter((w) => user.wallets.includes(w as `0x${string}`)) : [];
  // Only the parties see who has agreed.
  return Response.json({
    eligible: state.eligible,
    stage: state.stage,
    featuredOn: state.featuredOn,
    party: mine.length > 0,
    iAgreed: mine.some((w) => state.agreed.includes(w)),
    allAgreed: mine.length > 0 ? state.needed.every((w) => state.agreed.includes(w)) : undefined,
    twoParties: state.needed.length > 1,
  });
}

async function asParty(request: Request, raw: string) {
  const caseId = parseCaseId(raw);
  if (!caseId) return { error: bad("Bad case id.") };
  const user = await authenticate(request);
  if (!user) return { error: bad("Sign in first.", 401) };
  const c = await readCase(caseId);
  if (c.status === 0) return { error: bad("Case not found.", 404) };
  const wallet = [c.partyA, c.partyB].find((p) => user.wallets.includes(p.toLowerCase() as `0x${string}`));
  if (!wallet) return { error: bad("Only the people in this case can do that.", 403) };
  return { caseId, c, wallet };
}

export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/feature">) {
  const p = await asParty(request, (await ctx.params).id);
  if ("error" in p) return p.error;
  if (p.c.status !== 5) return bad("You can put a case forward once it has a verdict.", 409);
  try {
    await consentToFeature(p.caseId, p.c, p.wallet);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Something went wrong.", 500);
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/cases/[id]/feature">) {
  const p = await asParty(request, (await ctx.params).id);
  if ("error" in p) return p.error;
  const refused = await withdrawFeature(p.caseId, p.c, p.wallet);
  if (refused) return bad(refused, 409);
  return Response.json({ ok: true });
}
