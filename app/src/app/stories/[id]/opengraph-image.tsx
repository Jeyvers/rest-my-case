import { getThread } from "@/lib/server/stories";
import { card, CARD_SIZE, clip, Excerpt, Frame, Plain, siteHost, Title } from "@/lib/server/shareCard";

export const dynamic = "force-dynamic";
export const alt = "An Ex Story on Rest My Case.";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getThread(id, null).catch(() => null);
  if (!t) {
    return card(
      <Frame pill="EX STORIES" cta="Read the stories →" url={`${siteHost()}/stories`}>
        <Plain line="What did your ex do? Anonymous stories, told in threads." />
      </Frame>,
    );
  }
  return card(
    <Frame pill={t.parts.length > 1 ? `EX STORIES · A THREAD IN ${t.parts.length}` : "EX STORIES"} cta="Read the whole story →" url={`${siteHost()}/stories`}>
      <Title size={t.title.length > 48 ? 52 : 62}>{clip(t.title, 80)}</Title>
      <Excerpt text={t.parts[0]?.body ?? ""} />
    </Frame>,
  );
}
