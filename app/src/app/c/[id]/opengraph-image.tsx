import { publicCase } from "@/lib/server/publicCase";
import { card, clip, CARD_SIZE, Faceoff, Frame, Plain, siteHost, Story, Title } from "@/lib/server/shareCard";

export const dynamic = "force-dynamic";
export const alt = "A case on Rest My Case. Who's right?";
export const size = CARD_SIZE;
export const contentType = "image/png";

/** Public cases show their text and, once decided, the verdict. Private ones show only a generic card. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pc = /^[1-9]\d{0,18}$/.test(id) ? await publicCase(BigInt(id)) : null;
  const url = `${siteHost()}/c/${id}`;
  if (!pc) {
    return card(
      <Frame pill="A PRIVATE CASE" cta="Settle your own →" url={siteHost()}>
        <Plain line="Two people. One argument. A jury of real people." />
      </Frame>,
    );
  }
  const { c, title, sideA, sideB } = pc;
  const decided = c.status === 5;
  const tally = `${Math.max(c.votesA, c.votesB)}–${Math.min(c.votesA, c.votesB)}`;
  const oneSided = c.mode === 1;
  const pill = decided ? `CASE #${id} · VERDICT ${tally}` : c.status === 6 ? `CASE #${id} · NO VERDICT` : `CASE #${id} · JURY OUT`;
  const cta = decided ? "See how they voted →" : "You be the judge →";
  const heading = clip(title ?? (oneSided ? "Am I in the wrong?" : "Which side wins?"), 80);

  return card(
    <Frame pill={pill} cta={cta} url={url}>
      <Title size={heading.length > 48 ? 50 : 60}>{heading}</Title>
      {oneSided ? (
        <Story text={sideA} verdict={decided ? (c.verdict === 1 ? "right" : "wrong") : null} />
      ) : (
        <Faceoff
          a={{ who: "Side A", says: sideA }}
          b={{ who: "Side B", says: sideB ?? "" }}
          winner={decided ? (c.verdict === 1 ? "A" : "B") : null}
        />
      )}
    </Frame>,
  );
}
