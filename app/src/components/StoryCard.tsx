import Link from "next/link";
import { formatDay } from "@/lib/daily";
import { REACTIONS, type StoryCard as Card } from "@/lib/stories";

export function TagPills({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t} className="rounded-full border-2 border-ink/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-ink/65">
          {t}
        </span>
      ))}
    </span>
  );
}

/** One story in the feed: the opening post, tap for the whole thread. */
export function StoryCard({ s }: { s: Card }) {
  const reacted = REACTIONS.filter((r) => s.reactions[r.key] > 0);
  return (
    <Link href={`/stories/${s.id}`} className="tile flex flex-col gap-2 bg-white p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <TagPills tags={s.tags} />
        <span className="shrink-0 text-xs font-bold text-ink/50">{formatDay(s.day, { year: false })}</span>
      </div>
      <p className="font-display text-xl font-extrabold leading-tight">{s.title}</p>
      <p className="line-clamp-4 whitespace-pre-line text-ink/85">{s.opening}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-ink/60">
        <span className="text-court">{s.parts > 1 ? `Read the thread (${s.parts} posts) →` : "Read it →"}</span>
        {reacted.map((r) => (
          <span key={r.key}>{r.emoji} {s.reactions[r.key]}</span>
        ))}
        {s.reads > 0 && <span>{s.reads} {s.reads === 1 ? "read" : "reads"}</span>}
      </div>
    </Link>
  );
}
