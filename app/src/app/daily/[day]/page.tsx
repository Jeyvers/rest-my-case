import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginButton } from "@/components/LoginButton";
import { Page, Title } from "@/components/ui";
import { formatDay, isDay, lockedView, question, utcDay } from "@/lib/daily";
import { caseForDay, dailyView } from "@/lib/server/daily";
import { DailyGame } from "./DailyGame";
import { HotNow } from "./HotNow";

type Props = { params: Promise<{ day: string }> };

function prevDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  const found = isDay(day) ? await caseForDay(day).catch(() => null) : null;
  if (!found) return { title: "Case of the Day · Rest My Case" };
  const title = `Case of the Day #${found.number}: ${found.row.title}`;
  const description = `${found.row.side_a_who} or ${found.row.side_b_who}? ${question(found.row)} Play free on Rest My Case.`;
  return { title: `${title} · Rest My Case`, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function DailyPage({ params }: Props) {
  const { day } = await params;
  if (!isDay(day) || day > utcDay()) notFound();
  const [view, prev] = await Promise.all([dailyView(day), caseForDay(prevDay(day)).catch(() => null)]);
  if (!view) {
    if (day !== utcDay()) notFound();
    return (
      <Page>
        <Title sub="Check back soon: the first case is on its way.">Case of the Day</Title>
      </Page>
    );
  }
  return (
    <Page>
      <DailyGame initial={lockedView(view)} prevDay={prev ? prevDay(day) : null} dateLabel={formatDay(day)} />
      {view.today && <HotNow />}
      {/* Most people land here from a shared link: show them what the app is for. */}
      <section className="tile flex flex-col items-center gap-4 bg-court p-6 text-center text-white">
        <p className="font-display text-2xl font-extrabold">Got your own argument?</p>
        <p className="max-w-md text-lg text-white/90">
          Put it to a jury. 5 random, verified people read both sides, vote in secret, and settle it. Small fee in G$. No
          verdict, money back.
        </p>
        <LoginButton />
      </section>
    </Page>
  );
}
