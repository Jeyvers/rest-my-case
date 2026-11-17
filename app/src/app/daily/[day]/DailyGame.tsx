"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote, Hint } from "@/components/ui";
import { Spinner } from "@/components/Loading";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { useNow } from "@/hooks/useNow";
import { question, shareText, type DailyCase, type Side } from "@/lib/daily";

type Saved = { clues: number; pick: Side | null; cluesAtPick: number };
type View = DailyCase & { counted?: boolean };

const key = (day: string) => `daily:${day}`;
function load(day: string): Saved | null {
  try {
    const raw = localStorage.getItem(key(day));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function save(day: string, s: Saved) {
  try {
    localStorage.setItem(key(day), JSON.stringify(s));
  } catch {}
}

function untilMidnight(nowSec: number): string {
  const left = 86_400 - (nowSec % 86_400);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DailyGame(props: { initial: View; prevDay: string | null; dateLabel: string; heading?: "h1" | "h2" }) {
  const { initial, prevDay, dateLabel } = props;
  const Heading = props.heading ?? "h1";
  const authFetch = useAuthFetch();
  const { ready, authenticated, login } = usePrivy();
  const now = useNow(30_000);
  const [v, setV] = useState<View>(initial);
  const [clues, setClues] = useState(0);
  const [pick, setPick] = useState<Side | null>(null);
  const [cluesAtPick, setCluesAtPick] = useState(0);
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [peek, setPeek] = useState(false);
  const day = v.day;

  // Restore this device's progress, then (signed in) the pick saved on the server.
  useEffect(() => {
    let off = false;
    // After hydration (the server can't see this device's storage), so server and client first render match.
    queueMicrotask(() => {
      const s = off ? null : load(day);
      if (!s) return;
      setClues(s.clues);
      setPick(s.pick);
      setCluesAtPick(s.cluesAtPick);
    });
    return () => {
      off = true;
    };
  }, [day]);
  useEffect(() => {
    if (!ready) return;
    authFetch<View>(`/api/daily/${day}`)
      .then((fresh) => {
        setV(fresh);
        const serverPick = fresh.reveal?.myPick ?? null;
        if (serverPick) setPick((p) => p ?? serverPick);
      })
      .catch(() => {});
  }, [ready, authenticated, day, authFetch]);
  // A pick made on an earlier visit (saved on this device): fetch its reveal again.
  useEffect(() => {
    if (authenticated && !v.locked && pick && !v.reveal) {
      authFetch<View>(`/api/daily/${day}`, { method: "POST", body: JSON.stringify({ vote: pick, clue: cluesAtPick }) })
        .then(setV)
        .catch(() => {});
    }
  }, [authenticated, v.locked, pick, v.reveal, day, cluesAtPick, authFetch]);

  const [card, setCard] = useState<File | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/daily/${day}/opengraph-image`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && !off) setCard(new File([b], `rest-my-case-${day}.png`, { type: "image/png" }));
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [day]);

  const remember = useCallback((s: Saved) => save(day, s), [day]);

  function revealClue() {
    const n = Math.min(clues + 1, v.clueCount);
    setClues(n);
    remember({ clues: n, pick, cluesAtPick });
  }

  async function lockIn(side: Side) {
    setBusy(side);
    setError(undefined);
    try {
      const fresh = await authFetch<View>(`/api/daily/${day}`, { method: "POST", body: JSON.stringify({ vote: side, clue: clues }) });
      setV(fresh);
      // The server keeps your first pick if you'd already made one today.
      const final = fresh.reveal?.myPick ?? side;
      setPick(final);
      setCluesAtPick(clues);
      remember({ clues, pick: final, cluesAtPick: clues });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't lock that in. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const shareUrl = typeof window === "undefined" ? `/daily/${day}` : `${window.location.origin}/daily/${day}`;
  const resultText = pick && !v.locked ? shareText(v, pick, cluesAtPick, shareUrl) : `⚖️ Case of the Day #${v.number}: “${v.title}”\n${question(v)} ${shareUrl}`;

  async function share() {
    // With the picture card when the device can share files (phones, Safari); text otherwise.
    if (card && navigator.canShare?.({ files: [card] })) {
      await navigator.share({ files: [card], text: resultText }).catch(() => {});
      return;
    }
    if (navigator.share) {
      await navigator.share({ text: resultText }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(resultText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    if (!card) return;
    const url = URL.createObjectURL(card);
    const a = document.createElement("a");
    a.href = url;
    a.download = card.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const locked = v.locked;
  const mine = locked ? null : pick;
  const r = v.reveal;
  const showReveal = Boolean((mine || peek) && r);
  const answer = r?.answer ?? null;
  const decided = Boolean(answer && (r?.final || v.basis !== "players"));
  const right = decided && mine ? answer === mine : null;
  const who = (s: Side) => (s === "A" ? v.sideA.who : v.sideB.who);
  const total = r ? r.tally.a + r.tally.b : 0;
  const pa = total ? Math.round((r!.tally.a / total) * 100) : 0;
  const allClues = Boolean(mine) || peek ? v.clues.length : clues;

  return (
    <div className="flex flex-col gap-5">
      {/* Masthead */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border-2 border-ink bg-verdict px-3 py-0.5 font-display text-sm font-extrabold uppercase tracking-wide shadow-[0_3px_0_0_var(--color-ink)]">
            Case of the Day #{v.number}
          </span>
          <span className="text-sm font-bold text-ink/60">{dateLabel}</span>
          <span className="rounded-full border-2 border-ink/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-ink/60">
            {v.category}
          </span>
        </div>
        <Heading className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">{v.title}</Heading>
      </div>

      <section className="tile bg-court p-5 text-white">
        <p className="text-lg leading-relaxed">{v.story}</p>
      </section>

      {/* Clues: one at a time. The fewer you needed, the better your share card looks. */}
      {v.clues.length > 0 && (
        <section className="flex flex-col gap-2">
          <ol className="flex flex-col gap-2">
            {v.clues.slice(0, allClues).map((c, i) => (
              <li key={i} className="tile flex gap-3 bg-white p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-verdict font-display font-extrabold">
                  {i + 1}
                </span>
                <p className="pt-0.5">{c}</p>
              </li>
            ))}
          </ol>
          {allClues < v.clueCount && (
            <button type="button" onClick={revealClue} className="btn-secondary self-start">
              🔍 Reveal clue {allClues + 1} of {v.clueCount}
            </button>
          )}
        </section>
      )}

      {/* Locked: signed out. The case is the hook; playing needs an account. */}
      {locked && (
        <section className="tile flex flex-col gap-3 bg-verdict p-5">
          <p className="font-display text-2xl font-extrabold">{question(v)} Sign in to play.</p>
          <p>
            {v.clueCount > 0 ? `${v.clueCount} clues are waiting. ` : ""}
            Call the verdict, see if you were right, and see how everyone else picked. It&apos;s free.
          </p>
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
            {(["A", "B"] as const).map((s) => (
              <span
                key={s}
                className={`flex items-center justify-center rounded-2xl border-[3px] border-ink px-4 py-3 text-center text-white ${
                  s === "A" ? "bg-side-a" : "bg-side-b"
                }`}
              >
                <span className="font-display text-lg font-extrabold">🔒 {s} · {who(s)}</span>
              </span>
            ))}
          </div>
          {!ready || authenticated ? (
            <p className="flex items-center gap-2 font-semibold"><Spinner /> Opening the case…</p>
          ) : (
            <button type="button" onClick={login} className="btn self-start bg-white">Sign in to play</button>
          )}
        </section>
      )}

      {/* Pick */}
      {!locked && !mine && !peek && (
        <section className="tile flex flex-col gap-3 bg-verdict p-5">
          <p className="font-display text-2xl font-extrabold">{question(v)}</p>
          {v.clueCount > 0 && (
            <Hint>
              Lock in with fewer clues to brag about it: your result shows how many you needed ({clues} of {v.clueCount} so far).
            </Hint>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {(["A", "B"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy !== null}
                onClick={() => lockIn(s)}
                className={`flex items-center justify-center rounded-2xl border-[3px] border-ink px-4 py-3 text-center text-white shadow-[0_5px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-75 active:translate-y-[5px] active:shadow-none ${
                  s === "A" ? "bg-side-a" : "bg-side-b"
                }`}
              >
                <span className="font-display text-lg font-extrabold">{busy === s ? <Spinner /> : `${s} · ${who(s)}`}</span>
              </button>
            ))}
          </div>
          <ErrorNote>{error}</ErrorNote>
          {!v.today && r && (
            <button type="button" onClick={() => setPeek(true)} className="self-start text-sm font-bold underline underline-offset-4">
              Just show me the answer
            </button>
          )}
        </section>
      )}

      {/* Reveal */}
      {showReveal && r && (
        <section className="tile flex flex-col gap-3 p-5">
          {decided ? (
            <>
              {right !== null && (
                <p className="font-display text-3xl font-extrabold">{right ? "✅ You called it!" : "❌ Not this time"}</p>
              )}
              <p className="text-lg">
                The answer: <strong>{answer} · {who(answer!)}</strong>
                {mine && <span className="text-ink/60"> (you picked {mine} · {who(mine)})</span>}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-extrabold">🗳️ You sided with {mine ? who(mine) : "…"}</p>
              <p>
                No fixed answer on this one: today&apos;s verified players decide. The verdict lands at midnight UTC
                {v.today ? `, in ${untilMidnight(now)}` : ""}.
                {r.final && !answer && " It ended in a tie."}
              </p>
            </>
          )}
          {r.explanation && <p className="text-ink/80">{r.explanation}</p>}
          {v.basis === "known" && (
            <Hint>Based on how disputes like this are usually decided. An honest outside view, not legal advice.</Hint>
          )}
          {v.caseUrl && (
            <Link href={v.caseUrl} className="text-sm font-bold underline underline-offset-4">
              See the original case and how its jury voted →
            </Link>
          )}

          {total > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold text-ink/70">How verified players picked</p>
              <div className="flex h-8 overflow-hidden rounded-full border-2 border-ink text-sm font-bold text-white">
                {r.tally.a > 0 && <div className="flex items-center bg-side-a pl-3" style={{ width: `${pa}%` }}>A {pa}%</div>}
                {r.tally.b > 0 && <div className="flex flex-1 items-center justify-end bg-side-b pr-3">B {100 - pa}%</div>}
              </div>
              <p className="text-xs text-ink/60">{total} {total === 1 ? "player" : "players"}</p>
            </div>
          )}
          {mine && v.today && !v.counted && (
            <Hint>
              Your pick isn&apos;t in the count. Verify you&apos;re a real person (from your account page) and tomorrow&apos;s
              pick will count.
            </Hint>
          )}
        </section>
      )}

      {/* Share */}
      <section className="tile flex flex-col gap-3 bg-lilac p-5">
        <p className="font-display text-xl font-extrabold">{mine ? "Share your result" : "Challenge a friend"}</p>
        {mine && <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-sm leading-relaxed">{resultText}</pre>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={share} className="btn">{copied ? "Copied!" : "Share"}</button>
          {card && (
            <button type="button" onClick={download} className="btn-secondary">
              Download image
            </button>
          )}
          <a
            className="btn-secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://x.com/intent/post?text=${encodeURIComponent(resultText)}`}
          >
            Post on X
          </a>
          <a
            className="btn-secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(resultText)}`}
          >
            WhatsApp
          </a>
        </div>
      </section>

      <nav className="flex items-center justify-between text-sm font-bold">
        {prevDay ? (
          <Link href={`/daily/${prevDay}`} className="underline underline-offset-4">← Previous case</Link>
        ) : (
          <span />
        )}
        {v.today ? (
          <span className="text-ink/60">Next case in {untilMidnight(now)}</span>
        ) : (
          <Link href="/" className="underline underline-offset-4">Today&apos;s case →</Link>
        )}
      </nav>
    </div>
  );
}
