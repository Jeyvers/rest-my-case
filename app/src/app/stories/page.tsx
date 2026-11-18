import type { Metadata } from "next";
import Link from "next/link";
import { StoryCard } from "@/components/StoryCard";
import { Page } from "@/components/ui";
import { STORY_TAGS, type StoryTag } from "@/lib/stories";
import { listStories } from "@/lib/server/stories";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ex Stories · Rest My Case",
  description: "Anonymous stories about exes. No jury, no verdict. Just the story.",
};

type Props = { searchParams: Promise<{ sort?: string; tag?: string; before?: string }> };

export default async function StoriesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sort = sp.sort === "top" ? "top" : "new";
  const tag = (STORY_TAGS as readonly string[]).includes(sp.tag ?? "") ? (sp.tag as StoryTag) : null;
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null;
  const page = await listStories({ sort, tag, before }).catch(() => ({ items: [], next: null }));
  const href = (o: { sort?: string; tag?: string | null; before?: string }) => {
    const q = new URLSearchParams();
    const s = o.sort ?? sort;
    const t = o.tag === undefined ? tag : o.tag;
    if (s === "top") q.set("sort", "top");
    if (t) q.set("tag", t);
    if (o.before) q.set("before", o.before);
    const qs = q.toString();
    return qs ? `/stories?${qs}` : "/stories";
  };
  const chip = (on: boolean) =>
    `rounded-full border-2 border-ink px-3 py-1 text-sm font-bold ${on ? "bg-ink text-white" : "bg-white"}`;

  return (
    <Page>
      <section className="tile flex flex-col gap-3 bg-court p-5 text-white">
        <h1 className="font-display text-4xl font-extrabold leading-none">Ex Stories</h1>
        <p className="text-lg text-white/90">What did your ex do? Tell it anonymously. No jury, no verdict. Just the story.</p>
        <Link href="/stories/new" className="btn self-start">Tell yours</Link>
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Link href={href({ sort: "new" })} className={chip(sort === "new")}>Newest</Link>
          <Link href={href({ sort: "top" })} className={chip(sort === "top")}>Most read</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={href({ tag: null })} className={chip(!tag)}>All</Link>
          {STORY_TAGS.map((t) => (
            <Link key={t} href={href({ tag: t })} className={chip(tag === t)}>{t}</Link>
          ))}
        </div>
      </div>

      {page.items.length === 0 ? (
        <section className="tile flex flex-col items-start gap-3 bg-white p-5">
          <p className="font-display text-xl font-extrabold">{tag ? `No ${tag} stories yet.` : "No stories yet."}</p>
          <p>Be the first. It&apos;s anonymous: nobody sees your name, wallet or profile.</p>
          <Link href="/stories/new" className="btn">Tell yours</Link>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {page.items.map((s) => <StoryCard key={s.id} s={s} />)}
        </div>
      )}
      {page.next && (
        <Link href={href({ before: page.next })} className="btn-secondary self-center">Older stories</Link>
      )}
    </Page>
  );
}
