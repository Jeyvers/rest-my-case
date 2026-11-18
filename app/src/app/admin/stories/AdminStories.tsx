"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { Loading, Spinner } from "@/components/Loading";
import { ThreadEditor } from "@/components/ThreadEditor";
import { ErrorNote, Hint, Page, Title } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { formatDay } from "@/lib/daily";
import { REPORT_REASONS, type StoryThread } from "@/lib/stories";

type Reported = {
  id: string;
  title: string;
  status: "live" | "hidden";
  day: string;
  reportCount: number;
  reports: { reason: string; note: string | null; day: string }[];
};
const reasonLabel = (k: string) => REPORT_REASONS.find((r) => r.key === k)?.label ?? k;

/** Admin: reported and hidden Ex Stories. Edit, restore, or delete for good. */
export function AdminStories() {
  const { ready, authenticated, login } = usePrivy();
  const authFetch = useAuthFetch();
  const [items, setItems] = useState<Reported[] | null>(null);
  const [denied, setDenied] = useState<string>();
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(
    () =>
      authFetch<{ stories: Reported[] }>("/api/admin/stories")
        .then((j) => setItems(j.stories))
        .catch((e) => setDenied(e instanceof Error ? e.message : "Couldn't load.")),
    [authFetch],
  );
  useEffect(() => {
    if (ready && authenticated) void load();
  }, [ready, authenticated, load]);

  if (!ready) return <Page><Loading /></Page>;
  if (!authenticated) return <Page><Title>Ex Stories admin</Title><button className="btn self-start" onClick={login}>Sign in</button></Page>;
  if (denied) return <Page><Title>Ex Stories admin</Title><ErrorNote>{denied}</ErrorNote></Page>;
  if (!items) return <Page><Loading /></Page>;
  if (editing) {
    return (
      <Page>
        <StoryEditor id={editing} onDone={async () => { setEditing(null); await load(); }} />
      </Page>
    );
  }

  return (
    <Page>
      <Link href="/admin" className="text-sm font-bold underline underline-offset-4">← Daily Case admin</Link>
      <Title sub="Stories with reports. Three reports hide a story until you restore or delete it.">Ex Stories reports</Title>
      {items.length === 0 && <p className="tile bg-white p-4">No reports. All quiet.</p>}
      {items.map((s) => (
        <Row key={s.id} s={s} onEdit={() => setEditing(s.id)} onChanged={load} />
      ))}
    </Page>
  );
}

function Row({ s, onEdit, onChanged }: { s: Reported; onEdit: () => void; onChanged: () => Promise<unknown> }) {
  const authFetch = useAuthFetch();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  async function act(init: RequestInit) {
    setBusy(true);
    setError(undefined);
    try {
      await authFetch(`/api/admin/stories/${s.id}`, init);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tile flex flex-col gap-2 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold ${s.status === "hidden" ? "bg-side-a text-white" : "bg-side-b text-white"}`}>
          {s.status === "hidden" ? "Hidden" : "Live"}
        </span>
        <span className="text-sm font-bold text-ink/60">{s.reportCount} {s.reportCount === 1 ? "report" : "reports"} · posted {formatDay(s.day)}</span>
      </div>
      <Link href={`/stories/${s.id}`} className="font-display text-xl font-extrabold underline-offset-4 hover:underline">{s.title}</Link>
      <ul className="flex flex-col gap-1 text-sm">
        {s.reports.map((r, i) => (
          <li key={i}>
            <strong>{reasonLabel(r.reason)}</strong>
            {r.note ? `: ${r.note}` : ""} <span className="text-ink/50">({formatDay(r.day, { year: false })})</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy} onClick={onEdit}>Edit</button>
        {s.status === "hidden" ? (
          <button className="btn-secondary" disabled={busy} onClick={() => act({ method: "PATCH", body: JSON.stringify({ status: "live", clearReports: true }) })}>
            Restore (clears reports)
          </button>
        ) : (
          <button className="btn-secondary" disabled={busy} onClick={() => act({ method: "PATCH", body: JSON.stringify({ status: "hidden" }) })}>
            Hide
          </button>
        )}
        {s.status === "live" && (
          <button className="btn-secondary" disabled={busy} onClick={() => act({ method: "PATCH", body: JSON.stringify({ clearReports: true }) })}>
            Dismiss reports
          </button>
        )}
        {confirm ? (
          <button className="btn-secondary bg-side-a! text-white" disabled={busy} onClick={() => act({ method: "DELETE" })}>
            {busy ? <Spinner /> : "Delete for good"}
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => setConfirm(true)}>Delete</button>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}

function StoryEditor({ id, onDone }: { id: string; onDone: () => Promise<void> }) {
  const authFetch = useAuthFetch();
  const [title, setTitle] = useState<string | null>(null);
  const [parts, setParts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    authFetch<StoryThread>(`/api/admin/stories/${id}`)
      .then((t) => {
        setTitle(t.title);
        setParts(t.parts.map((p) => p.body));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load it."));
  }, [id, authFetch]);
  if (title === null) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />;

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await authFetch(`/api/admin/stories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, parts: parts.map((p) => p.trim()).filter(Boolean) }),
      });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Title sub="Fix anything that identifies someone. Saving replaces the whole thread.">Edit story</Title>
      <ThreadEditor title={title} onTitle={setTitle} parts={parts} onParts={setParts} />
      <div className="flex gap-2">
        <button className="btn" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Save"}</button>
        <button className="btn-secondary" onClick={() => void onDone()}>Cancel</button>
      </div>
      <Hint>Saving doesn&apos;t change whether it&apos;s hidden. Restore it from the list.</Hint>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
