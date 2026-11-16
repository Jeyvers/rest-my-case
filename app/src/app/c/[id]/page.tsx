import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/ui";
import { publicCase } from "@/lib/server/publicCase";
import { CaseView } from "./CaseView";
import { Loading } from "@/components/Loading";

/** Link previews: public cases show their title; private ones say nothing about what's inside. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const pc = /^[1-9]\d{0,18}$/.test(id) ? await publicCase(BigInt(id)) : null;
  if (!pc) return { title: `Case #${id} · Rest My Case` };
  const title = pc.title ?? (pc.c.mode === 1 ? "Am I in the wrong?" : "Which side wins?");
  const description =
    pc.c.status === 5 ? "The jury has spoken. See how they voted." : "Read both sides and pick. A jury of real people decides.";
  return { title: `${title} · Rest My Case`, description, openGraph: { title, description }, twitter: { title, description } };
}

export default function CasePage() {
  return (
    <Suspense fallback={<Page><Loading label="Opening the case…" /></Page>}>
      <CaseView />
    </Suspense>
  );
}
