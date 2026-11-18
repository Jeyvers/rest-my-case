import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { StoryComposer } from "./StoryComposer";

export const metadata: Metadata = { title: "Tell your story · Ex Stories", robots: { index: false } };

export default function NewStoryPage() {
  return (
    <Page>
      <StoryComposer />
    </Page>
  );
}
