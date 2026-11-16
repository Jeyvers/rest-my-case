import "server-only";
import { sameAddress, type ChainCase } from "@/lib/cases";
import { dataKey } from "@/lib/network";
import { readCase } from "./chain";
import { db } from "./supabase";

export type PublicCase = { c: ChainCase; title: string | null; sideA: string; sideB: string | null };

/**
 * A case's text for share cards and link previews, only if it's public (same rule as the case page: both sides
 * agreed, or A alone for one-sided, and not hidden by an admin). Null for missing or private cases. Never throws.
 */
export async function publicCase(caseId: bigint): Promise<PublicCase | null> {
  try {
    const c = await readCase(caseId);
    if (c.status === 0) return null;
    const [{ data: sides }, { data: flags }] = await Promise.all([
      db().from("sides").select("role, body, title, content_hash, public_consent").eq("network", dataKey).eq("case_id", caseId.toString()),
      db().from("case_flags").select("hidden").eq("network", dataKey).eq("case_id", caseId.toString()).maybeSingle(),
    ]);
    const a = sides?.find((s) => s.role === "A" && sameAddress(s.content_hash, c.contentA));
    const b = sides?.find((s) => s.role === "B" && sameAddress(s.content_hash, c.contentB));
    const oneSided = c.mode === 1;
    if (!a?.public_consent || (!oneSided && !b?.public_consent) || flags?.hidden) return null;
    return { c, title: a.title ?? null, sideA: a.body, sideB: oneSided ? null : b?.body ?? null };
  } catch {
    return null;
  }
}
