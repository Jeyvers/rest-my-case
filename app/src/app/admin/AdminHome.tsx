"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loading, Spinner } from "@/components/Loading";
import { ErrorNote, Hint, Page, Title } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { formatDay, MAX_CLUES, utcDay, type BankCase, type BankCaseInput } from "@/lib/daily";

type Slot = { day: string; case_id: string };
type Filter = "draft" | "approved" | "ran";

const EMPTY: BankCaseInput = {
  title: "",
  story: "",
  side_a_who: "",
  side_a: "",
  side_b_who: "",
  side_b: "",
  clues: [],
  answer: "jury",
  explanation: null,
  category: "everyday",
};

/** Owner-only: write, review, approve and schedule Daily Cases. Nothing goes live unless it's approved here. */
export function AdminHome() {
  const { ready, authenticated, login } = usePrivy();
  const authFetch = useAuthFetch();
  const [cases, setCases] = useState<BankCase[] | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [denied, setDenied] = useState<string>();
  const [filter, setFilter] = useState<Filter>("draft");
  const [editing, setEditing] = useState<BankCase | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await authFetch<{ cases: BankCase[]; slots: Slot[] }>("/api/admin/cases");
      setCases(j.cases);
      setSlots(j.slots);
      setDenied(undefined);
    } catch (e) {
      setDenied(e instanceof Error ? e.message : "Couldn't load.");
    }
  }, [authFetch]);
  useEffect(() => {
    if (!ready || !authenticated) return;
    authFetch<{ cases: BankCase[]; slots: Slot[] }>("/api/admin/cases")
      .then((j) => {
        setCases(j.cases);
        setSlots(j.slots);
      })
      .catch((e) => setDenied(e instanceof Error ? e.message : "Couldn't load."));
  }, [ready, authenticated, authFetch]);

  const ranOn = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots) m.set(s.case_id, [...(m.get(s.case_id) ?? []), s.day]);
    return m;
  }, [slots]);

  if (!ready) return <Page><Loading /></Page>;
  if (!authenticated) {
    return (
      <Page>
        <Title sub="For the app owner.">Admin</Title>
        <button className="btn self-start" onClick={login}>Sign in</button>
      </Page>
    );
  }
  if (denied) return <Page><Title>Admin</Title><ErrorNote>{denied}</ErrorNote></Page>;
  if (!cases) return <Page><Loading label="Opening the case bank…" /></Page>;

  if (editing) {
    return (
      <Page>
        <Editor
          initial={editing === "new" ? null : editing}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      </Page>
    );
  }

  const today = utcDay();
  const todaySlot = slots.find((s) => s.day === today);
  const todayCase = todaySlot ? cases.find((c) => c.id === todaySlot.case_id) : null;
  const pinned = cases.filter((c) => c.scheduled_date && c.scheduled_date > today).sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!));
  const approvedUnused = cases.filter((c) => c.status === "approved" && !ranOn.has(c.id) && !c.scheduled_date).length;
  const shown = cases.filter((c) =>
    filter === "ran" ? ranOn.has(c.id) : filter === "approved" ? c.status === "approved" && !ranOn.has(c.id) : c.status === "draft",
  );
  const count = (f: Filter) =>
    cases.filter((c) => (f === "ran" ? ranOn.has(c.id) : f === "approved" ? c.status === "approved" && !ranOn.has(c.id) : c.status === "draft")).length;

  return (
    <Page>
      <div className="flex items-start justify-between gap-3">
        <Title sub="Write, review, approve and schedule. Nothing goes live until you approve it.">Daily Case admin</Title>
        <button className="btn shrink-0" onClick={() => setEditing("new")}>+ New</button>
      </div>
      <Link href="/admin/stories" className="btn-secondary self-start">Ex Stories reports →</Link>

      <section className="tile flex flex-col gap-2 p-4">
        <p className="font-display text-lg font-extrabold">Line-up</p>
        <p>
          <strong>Today:</strong>{" "}
          {todayCase ? <Link className="underline" href={`/daily/${today}`}>{todayCase.title}</Link> : "not picked yet (fills on first visit)"}
        </p>
        {pinned.slice(0, 7).map((c) => (
          <p key={c.id}>
            <strong>{formatDay(c.scheduled_date!)}:</strong> {c.title} {c.status !== "approved" && <span className="text-side-a">(draft: won&apos;t run until approved)</span>}
          </p>
        ))}
        <Hint>
          {approvedUnused} approved {approvedUnused === 1 ? "case" : "cases"} waiting in line. Unpinned days take the next one:
          user cases first, then bank cases, oldest first. When none are left, the case shown longest ago runs again.
        </Hint>
        {approvedUnused < 7 && (
          <p className="rounded-xl border-2 border-side-a bg-side-a/10 px-3 py-2 text-sm font-semibold">
            Fewer than a week of fresh cases left. Approve more drafts or add new ones.
          </p>
        )}
      </section>

      <nav className="flex gap-1 rounded-2xl border-[3px] border-ink bg-white p-1">
        {(["draft", "approved", "ran"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-xl px-2 py-2 font-display font-extrabold ${filter === f ? "bg-ink text-white" : "text-ink/70"}`}
          >
            {f === "draft" ? "To review" : f === "approved" ? "Approved" : "Has run"} ({count(f)})
          </button>
        ))}
      </nav>

      <ul className="flex flex-col gap-3">
        {shown.map((c) => (
          <CaseRow key={c.id} c={c} ran={ranOn.get(c.id) ?? []} onEdit={() => setEditing(c)} onChanged={load} />
        ))}
        {shown.length === 0 && <p className="text-ink/60">Nothing here.</p>}
      </ul>
    </Page>
  );
}

function CaseRow({ c, ran, onEdit, onChanged }: { c: BankCase; ran: string[]; onEdit: () => void; onChanged: () => Promise<void> }) {
  const authFetch = useAuthFetch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [date, setDate] = useState(c.scheduled_date ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tomorrow] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await authFetch(`/api/admin/cases/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await authFetch(`/api/admin/cases/${c.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete.");
      setBusy(false);
    }
  }

  return (
    <li className="tile flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide">
        <span className={`rounded-full border-2 border-ink px-2 py-0.5 ${c.status === "approved" ? "bg-side-b text-white" : "bg-white"}`}>{c.status}</span>
        <span className="rounded-full border-2 border-ink/20 px-2 py-0.5 text-ink/70">{c.category}</span>
        {c.source === "user" && <span className="rounded-full border-2 border-ink bg-verdict px-2 py-0.5">User case #{c.source_case_id}</span>}
        <span className="text-ink/60">Answer: {c.answer === "jury" ? "players decide" : c.answer}</span>
        <span className="text-ink/60">{c.clues.length} clues</span>
      </div>
      <p className="font-display text-lg font-extrabold">{c.title}</p>
      <p className="line-clamp-2 text-sm text-ink/75">{c.story}</p>
      {c.review_flags.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-verdict/40 px-3 py-2 text-sm">
          {c.review_flags.map((f) => <li key={f}>⚠️ {f}</li>)}
        </ul>
      )}
      {ran.length > 0 && <Hint>Ran on {ran.map((d) => formatDay(d)).join(", ")}</Hint>}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={onEdit} disabled={busy}>Edit</button>
        {c.status === "draft" ? (
          <button className="btn-secondary bg-side-b! text-white!" disabled={busy} onClick={() => patch({ status: "approved", review_flags: [] })}>
            {busy ? <Spinner /> : "Approve"}
          </button>
        ) : (
          ran.length === 0 && <button className="btn-secondary" disabled={busy} onClick={() => patch({ status: "draft" })}>Back to draft</button>
        )}
        {ran.length === 0 && (
          <span className="flex items-center gap-1">
            <input
              type="date"
              min={tomorrow}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border-[3px] border-ink px-2 py-1 text-sm"
              aria-label="Schedule for"
            />
            <button className="btn-secondary" disabled={busy || date === (c.scheduled_date ?? "")} onClick={() => patch({ scheduled_date: date || null })}>
              {date ? "Pin to date" : "Unpin"}
            </button>
          </span>
        )}
        {ran.length === 0 &&
          (confirmDelete ? (
            <button className="btn-secondary bg-side-a! text-white!" disabled={busy} onClick={remove}>Really delete</button>
          ) : (
            <button className="text-sm font-bold text-side-a underline" onClick={() => setConfirmDelete(true)}>Delete</button>
          ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </li>
  );
}

function Field(props: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-bold">{props.label}</span>
      {props.children}
      {props.hint && <span className="text-xs text-ink/60">{props.hint}</span>}
    </label>
  );
}

const input = "rounded-xl border-[3px] border-ink bg-white px-3 py-2";

function Editor({ initial, onDone }: { initial: BankCase | null; onDone: () => Promise<void> }) {
  const authFetch = useAuthFetch();
  const [f, setF] = useState<BankCaseInput>(initial ? { ...initial } : EMPTY);
  const [cluesText, setCluesText] = useState((initial?.clues ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = <K extends keyof BankCaseInput>(k: K, v: BankCaseInput[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(undefined);
    const body = { ...f, clues: cluesText.split("\n").map((s) => s.trim()).filter(Boolean) };
    try {
      if (initial) await authFetch(`/api/admin/cases/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await authFetch("/api/admin/cases", { method: "POST", body: JSON.stringify(body) });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Title sub={initial ? "Saving keeps its status. Approve it from the list." : "New cases start as drafts."}>
        {initial ? "Edit case" : "New case"}
      </Title>
      <Field label="Title"><input className={input} value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="Story" hint="The setup everyone reads first. Roles, never names.">
        <textarea className={input} rows={4} value={f.story} maxLength={600} onChange={(e) => set("story", e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Side A name"><input className={input} value={f.side_a_who} maxLength={40} placeholder="Me" onChange={(e) => set("side_a_who", e.target.value)} /></Field>
        <Field label="Side B name"><input className={input} value={f.side_b_who} maxLength={40} placeholder="My landlord" onChange={(e) => set("side_b_who", e.target.value)} /></Field>
      </div>
      <Field label={`Clues (one per line, up to ${MAX_CLUES})`} hint="Revealed one at a time, in this order. Save the most telling for last.">
        <textarea className={input} rows={4} value={cluesText} onChange={(e) => setCluesText(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Answer" hint="A or B for a known answer. 'Players decide' for pure opinion cases.">
          <select className={input} value={f.answer} onChange={(e) => set("answer", e.target.value as BankCaseInput["answer"])}>
            <option value="A">A is right</option>
            <option value="B">B is right</option>
            <option value="jury">Players decide (verified majority)</option>
          </select>
        </Field>
        <Field label="Category"><input className={input} value={f.category} maxLength={30} onChange={(e) => set("category", e.target.value)} /></Field>
      </div>
      <Field label="Explanation" hint="Shown after the reveal: why that's the answer.">
        <textarea className={input} rows={3} value={f.explanation ?? ""} maxLength={1000} onChange={(e) => set("explanation", e.target.value || null)} />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <button className="btn" disabled={busy} onClick={submit}>{busy ? <Spinner /> : "Save"}</button>
        <button className="btn-secondary" disabled={busy} onClick={() => onDone()}>Cancel</button>
      </div>
    </div>
  );
}
