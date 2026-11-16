"use client";

import { useEffect, useState } from "react";
import { CaseCard } from "@/components/CaseCard";
import type { FeedItem } from "@/lib/crowd";

/** "Hot right now": the most active live user case. Hidden when nothing is live. */
export function HotNow() {
  const [item, setItem] = useState<FeedItem | null>(null);
  useEffect(() => {
    fetch("/api/daily/hot")
      .then((r) => r.json())
      .then((j: { item: FeedItem | null }) => setItem(j.item))
      .catch(() => {});
  }, []);
  if (!item) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-2xl font-extrabold">🔥 Hot right now</h2>
        <p className="text-ink/70">A real case a jury is deciding right now. Pick a side.</p>
      </div>
      <div className="tile overflow-hidden">
        <CaseCard it={item} />
      </div>
    </section>
  );
}
