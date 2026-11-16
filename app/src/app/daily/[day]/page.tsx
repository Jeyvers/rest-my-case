import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, Title } from "@/components/ui";
import { formatDay, isDay, utcDay } from "@/lib/daily";
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
  const description = `${found.row.side_a_who} vs ${found.row.side_b_who}. Who's right? Play free on Rest My Case.`;
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
      <DailyGame initial={view} prevDay={prev ? prevDay(day) : null} dateLabel={formatDay(day)} />
      {view.today && <HotNow />}
    </Page>
  );
}
