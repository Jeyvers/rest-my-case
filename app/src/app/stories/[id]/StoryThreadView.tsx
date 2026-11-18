"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { Loading, Spinner } from "@/components/Loading";
import { TagPills } from "@/components/StoryCard";
import { hasBlocking, ThreadEditor } from "@/components/ThreadEditor";
import { ErrorNote, Hint } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { formatDay } from "@/lib/daily";
import { REACTIONS, REPORT_REASONS, type ReactionKey, type ReportReason, type StoryThread } from "@/lib/stories";

/** One Ex Story, read as a thread. Anyone can read; reacting, reporting and posting need sign-in. */
export function StoryThreadView({ id, initial }: { id: string; initial: StoryThread | null }) {
  const { ready, authenticated, login } = usePrivy();
  const authFetch = useAuthFetch();
  const router = useRouter();
  const [t, setT] = useState<StoryThread | null>(initial);
  const [missing, setMissing] = useState(false);
  const [reactBusy, setReactBusy] = useState<ReactionKey | null>(null);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  // Signed in: learn whether this is your story and which reactions are yours (also shows your own hidden story).
  useEffect(() => {
    if (!ready) return;
    authFetch<StoryThread>(`/api/stories/${id}`)
      .then(setT)
      .catch(() => setMissing(true));
  }, [ready, authenticated, id, authFetch]);

  // Count one read per browser session.
  useEffect(() => {
    try {
      const k = `story-read:${id}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {}
    fetch(`/api/stories/${id}/read`, { method: "POST" }).catch(() => {});
  }, [id]);

  if (!t) {
    if (!missing && !ready) return <Loading />;
    return (
      <section className="tile flex flex-col items-start gap-3 bg-white p-5">
        <p className="font-display text-2xl font-extrabold">This story isn&apos;t here.</p>
        <p>It may have been removed, or the link is wrong.</p>
        <Link href="/stories" className="btn">Read other stories</Link>
      </section>
    );
  }

  async function react(key: ReactionKey) {
    if (!authenticated) return login();
    setReactBusy(key);
    setError(undefined);
    try {
      const r = await authFetch<Pick<StoryThread, "reactions" | "myReactions">>(`/api/stories/${id}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji: key }),
      });
      setT((cur) => (cur ? { ...cur, ...r } : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setReactBusy(null);
    }
  }

  async function share() {
    const url = window.location.href;
    const text = `${t!.title} · Ex Stories on Rest My Case`;
    if (navigator.share) return void navigator.share({ title: text, url }).catch(() => {});
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const n = t.parts.length;
  return (
    <article className="flex flex-col gap-5">
      <Link href="/stories" className="text-sm font-bold underline underline-offset-4">← Ex Stories</Link>

      {t.status === "hidden" && (
        <p className="rounded-xl border-2 border-side-a bg-side-a/10 px-3 py-2 font-semibold">
          Hidden while we review reports. Only you can see it right now.
        </p>
      )}

      <header className="flex flex-col gap-2">
        <TagPills tags={t.tags} />
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight">{t.title}</h1>
        <p className="text-sm font-bold text-ink/55">
          Anonymous · {formatDay(t.day)}
          {n > 1 ? ` · a thread in ${n}` : ""}
          {t.mine ? " · you wrote this" : ""}
        </p>
      </header>

      <ol className="flex flex-col">
        {t.parts.map((p, i) => (
          <li key={p.idx} className="relative flex gap-3 pb-5">
            {i < n - 1 && <span aria-hidden className="absolute left-[19px] top-11 bottom-0 w-[3px] rounded bg-ink/15" />}
            <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-court text-lg" aria-hidden>
              🎭
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-xs font-bold text-ink/50">
                {n > 1 ? `${i + 1}/${n}` : "Anonymous"}
                {p.day !== t.day ? ` · added ${formatDay(p.day, { year: false })}` : ""}
              </p>
              <p className="whitespace-pre-line text-lg leading-relaxed">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {REACTIONS.map((r) => {
          const on = t.myReactions.includes(r.key);
          return (
            <button
              key={r.key}
              type="button"
              disabled={reactBusy !== null || t.status !== "live"}
              onClick={() => react(r.key)}
              aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 font-bold ${on ? "bg-verdict" : "bg-white"}`}
            >
              <span className="text-lg">{reactBusy === r.key ? <Spinner /> : r.emoji}</span>
              {t.reactions[r.key] > 0 && <span>{t.reactions[r.key]}</span>}
            </button>
          );
        })}
        <button type="button" onClick={share} className="btn-secondary ml-auto">{copied ? "Link copied" : "Share"}</button>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {t.mine && <AuthorTools id={id} thread={t} onChange={setT} onDeleted={() => router.push("/stories")} />}

      {!t.mine && <ReportBox id={id} />}

      <Link href="/new" className="tile flex items-center justify-between gap-3 bg-lilac p-4 font-bold">
        <span>Got an argument instead? Put it to a jury.</span>
        <span aria-hidden>→</span>
      </Link>
    </article>
  );
}

function AuthorTools(props: { id: string; thread: StoryThread; onChange: (t: StoryThread) => void; onDeleted: () => void }) {
  const authFetch = useAuthFetch();
  const [adding, setAdding] = useState(false);
  const [parts, setParts] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const clean = parts.map((p) => p.trim()).filter(Boolean);

  async function add() {
    setBusy(true);
    setError(undefined);
    try {
      props.onChange(await authFetch<StoryThread>(`/api/stories/${props.id}/parts`, { method: "POST", body: JSON.stringify({ parts: clean }) }));
      setParts([""]);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(undefined);
    try {
      await authFetch(`/api/stories/${props.id}`, { method: "DELETE" });
      props.onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete it.");
      setBusy(false);
    }
  }

  return (
    <section className="tile flex flex-col gap-3 bg-white p-4">
      <p className="font-display text-lg font-extrabold">Your story</p>
      {adding ? (
        <>
          <ThreadEditor parts={parts} onParts={setParts} startAt={props.thread.parts.length + 1} />
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={busy || !clean.length || hasBlocking("", parts)} onClick={add}>
              {busy ? <Spinner /> : "Add to the thread"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setAdding(true)}>+ Add to the thread</button>
          {confirm ? (
            <>
              <button type="button" className="btn-secondary bg-side-a! text-white" disabled={busy} onClick={remove}>
                {busy ? <Spinner /> : "Yes, delete it for good"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirm(false)}>Keep it</button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setConfirm(true)}>Delete</button>
          )}
        </div>
      )}
      <Hint>Only you see these buttons. Readers never see who wrote it.</Hint>
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}

function ReportBox({ id }: { id: string }) {
  const { authenticated, login } = usePrivy();
  const authFetch = useAuthFetch();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (sent) return <Hint>Thanks. We&apos;ll take a look.</Hint>;
  if (!open) {
    return (
      <button type="button" className="self-start text-sm font-bold text-ink/55 underline underline-offset-4" onClick={() => (authenticated ? setOpen(true) : login())}>
        Report this story
      </button>
    );
  }
  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      await authFetch(`/api/stories/${id}/report`, { method: "POST", body: JSON.stringify({ reason, note }) });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tile flex flex-col gap-3 bg-white p-4">
      <p className="font-bold">What&apos;s wrong with it?</p>
      {REPORT_REASONS.map((r) => (
        <label key={r.key} className="flex items-center gap-2">
          <input type="radio" name="reason" checked={reason === r.key} onChange={() => setReason(r.key)} />
          {r.label}
        </label>
      ))}
      <textarea
        className="rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm"
        rows={2}
        maxLength={500}
        placeholder="Anything we should know? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="button" className="btn" disabled={!reason || busy} onClick={send}>{busy ? <Spinner /> : "Send report"}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}
