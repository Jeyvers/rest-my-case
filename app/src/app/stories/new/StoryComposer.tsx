"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { Loading, Spinner } from "@/components/Loading";
import { hasBlocking, ThreadEditor } from "@/components/ThreadEditor";
import { ErrorNote, Hint, Title } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { MIN_STORY, STORIES_PER_DAY, STORY_TAGS, storyProblem } from "@/lib/stories";

/** Write an Ex Story as a thread. Signed in (for abuse limits), always anonymous in public. */
export function StoryComposer() {
  const { ready, authenticated, login } = usePrivy();
  const authFetch = useAuthFetch();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [parts, setParts] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!ready) return <Loading />;
  if (!authenticated) {
    return (
      <section className="tile flex flex-col items-start gap-3 bg-court p-5 text-white">
        <Title sub={<span className="text-white/85">Sign in to post. Your story is always anonymous: nobody sees your name, wallet or profile.</span>}>
          Tell your story
        </Title>
        <button className="btn" onClick={login}>Sign in to write</button>
        <Link href="/stories" className="text-sm font-bold underline underline-offset-4">Just reading? Back to the stories</Link>
      </section>
    );
  }

  const toggle = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= 3 ? cur : [...cur, t]));
  const clean = parts.map((p) => p.trim()).filter(Boolean);
  const blocked = hasBlocking(title, parts);
  const problem = storyProblem(title, tags, clean);
  const length = clean.join("").length;

  async function post() {
    setBusy(true);
    setError(undefined);
    try {
      const { id } = await authFetch<{ id: string }>("/api/stories", { method: "POST", body: JSON.stringify({ title, tags, parts: clean }) });
      router.push(`/stories/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post it. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Title sub="Anonymous, always. Tell it in one post, or as a thread.">Tell your story</Title>

      <ThreadEditor title={title} onTitle={setTitle} parts={parts} onParts={setParts} />

      <div className="flex flex-col gap-2">
        <span className="font-bold">Tags <span className="font-normal text-ink/60">(pick 1 to 3)</span></span>
        <div className="flex flex-wrap gap-2">
          {STORY_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-bold ${tags.includes(t) ? "bg-ink text-white" : "bg-white"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <section className="tile flex flex-col gap-3 bg-white p-4">
        {blocked ? (
          <p className="font-semibold text-side-a">Remove the contact details highlighted in red to post.</p>
        ) : length < MIN_STORY ? (
          <Hint>Keep going: at least {MIN_STORY} characters ({length} so far).</Hint>
        ) : problem ? (
          <Hint>{problem}</Hint>
        ) : (
          <Hint>Posted with the date only, never the time. You can add to the thread or delete it later. Up to {STORIES_PER_DAY} stories a day.</Hint>
        )}
        <button type="button" className="btn self-start" disabled={busy || Boolean(problem)} onClick={post}>
          {busy ? <Spinner /> : "Post anonymously"}
        </button>
        <ErrorNote>{error}</ErrorNote>
      </section>
    </div>
  );
}
