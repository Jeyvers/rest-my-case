import { formatDay, isDay } from "@/lib/daily";
import { caseForDay } from "@/lib/server/daily";
import { card, clip, CARD_SIZE, Faceoff, Frame, Plain, siteHost, Title } from "@/lib/server/shareCard";

export const dynamic = "force-dynamic";
export const alt = "Rest My Case: Case of the Day. Who's right?";
export const size = CARD_SIZE;
export const contentType = "image/png";

/** Never shows the answer: the card is the hook, the page is the game. */
export default async function Image({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const found = isDay(day) ? await caseForDay(day).catch(() => null) : null;
  if (!found) {
    return card(
      <Frame pill="CASE OF THE DAY" cta="Who's right? Play free →" url={`${siteHost()}/daily`}>
        <Plain line="A new argument to judge, every day." />
      </Frame>,
    );
  }
  const { row, number } = found;
  return card(
    <Frame
      pill={`CASE OF THE DAY #${number} · ${formatDay(day, { year: false }).toUpperCase()}`}
      cta="Who's right? Play free →"
      url={`${siteHost()}/daily`}
    >
      <Title size={row.title.length > 48 ? 52 : 62}>{clip(row.title, 80)}</Title>
      <Faceoff a={{ who: row.side_a_who, says: row.side_a }} b={{ who: row.side_b_who, says: row.side_b }} />
    </Frame>,
  );
}
