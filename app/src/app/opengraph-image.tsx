import { card, CARD_SIZE, Frame, Plain, siteHost } from "@/lib/server/shareCard";

export const alt = "Rest My Case: settle an argument with a jury of real people.";
export const size = CARD_SIZE;
export const contentType = "image/png";

/** Default share card for every page without its own. */
export default async function Image() {
  return card(
    <Frame pill="YOU BE THE JUDGE" cta="Play today's case →" url={siteHost()}>
      <Plain line="Settle any argument with a jury of real people." />
    </Frame>,
  );
}
