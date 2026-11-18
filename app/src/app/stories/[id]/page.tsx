import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { getThread } from "@/lib/server/stories";
import { StoryThreadView } from "./StoryThreadView";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const thread = await getThread((await params).id, null).catch(() => null);
  if (!thread) return { title: "Ex Stories · Rest My Case" };
  const description = thread.parts[0]?.body.replace(/\s+/g, " ").slice(0, 160) ?? "";
  return {
    title: `${thread.title} · Ex Stories`,
    description,
    openGraph: { title: thread.title, description },
    twitter: { title: thread.title, description },
  };
}

export default async function StoryPage({ params }: Props) {
  const { id } = await params;
  const thread = await getThread(id, null).catch(() => null);
  // A hidden story comes back null here; its author still sees it (the client view refetches signed in).
  return (
    <Page>
      <StoryThreadView id={id} initial={thread} />
    </Page>
  );
}
