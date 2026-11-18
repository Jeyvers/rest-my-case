"use client";

import { useState } from "react";
import { applyFix, checkStory, MAX_PART, MAX_TITLE, type Finding } from "@/lib/stories";

export const ANON_NOTICE =
  "🔒 Keep it anonymous. Call them X, Mr X or Miss X, never their real name. Don't mention workplaces, schools, @handles or exact places.";

const keyOf = (f: Finding) => `${f.part}:${f.kind}:${f.text}`;

/** The post text with each finding highlighted. */
function Marked({ text, findings }: { text: string; findings: Finding[] }) {
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const f of findings) {
    if (f.start < at) continue;
    out.push(text.slice(at, f.start));
    out.push(
      <mark key={f.start} className={`rounded px-0.5 ${f.blocking ? "bg-side-a/30" : "bg-verdict/70"}`}>
        {text.slice(f.start, f.end)}
      </mark>,
    );
    at = f.end;
  }
  out.push(text.slice(at));
  return <p className="whitespace-pre-wrap rounded-xl bg-lilac p-3 text-sm leading-relaxed">{out}</p>;
}

function Findings(props: { findings: Finding[]; onFix: (f: Finding, fix: string) => void; onKeep: (f: Finding) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {props.findings.map((f) => (
        <li key={keyOf(f)} className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`font-bold ${f.blocking ? "text-side-a" : ""}`}>“{f.text}”</span>
          <span className="text-ink/70">{f.message}</span>
          {f.fixes.map((fix) => (
            <button
              key={fix || "remove"}
              type="button"
              onClick={() => props.onFix(f, fix)}
              className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-bold"
            >
              {fix ? `→ ${fix}` : "Remove"}
            </button>
          ))}
          {!f.blocking && (
            <button type="button" onClick={() => props.onKeep(f)} className="text-xs font-bold text-ink/55 underline underline-offset-2">
              Keep it
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Write a story as a thread: one box per post, with the identity check running as you type. Contact details
 * must go before posting; possible names and places get one-tap fixes, or "Keep it" for a false alarm.
 */
export function ThreadEditor(props: {
  title?: string;
  onTitle?: (t: string) => void;
  parts: string[];
  onParts: (p: string[]) => void;
  startAt?: number; // numbering when adding to an existing thread
}) {
  const { parts, onParts } = props;
  const [kept, setKept] = useState<Set<string>>(new Set());
  const all = checkStory(props.title ?? "", parts).filter((f) => f.blocking || !kept.has(keyOf(f)));
  const keep = (f: Finding) => setKept((s) => new Set(s).add(keyOf(f)));
  const fix = (f: Finding, replacement: string) => {
    if (f.part === -1) props.onTitle?.(applyFix(props.title ?? "", f, replacement));
    else onParts(parts.map((p, i) => (i === f.part ? applyFix(p, f, replacement) : p)));
  };
  const start = props.startAt ?? 1;
  const titleFindings = all.filter((f) => f.part === -1);

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border-2 border-ink bg-verdict/40 px-3 py-2 text-sm font-semibold">{ANON_NOTICE}</p>

      {props.onTitle && (
        <label className="flex flex-col gap-1">
          <span className="font-bold">Title</span>
          <input
            className="rounded-xl border-2 border-ink bg-white px-3 py-2"
            value={props.title}
            maxLength={MAX_TITLE}
            placeholder="He borrowed my car and…"
            onChange={(e) => props.onTitle!(e.target.value)}
          />
          {titleFindings.length > 0 && <Findings findings={titleFindings} onFix={fix} onKeep={keep} />}
        </label>
      )}

      <ol className="flex flex-col">
        {parts.map((p, i) => {
          const mine = all.filter((f) => f.part === i);
          return (
            <li key={i} className="relative flex gap-3 pb-4">
              {/* The thread line */}
              {i < parts.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 bottom-0 w-[3px] rounded bg-ink/15" />}
              <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-court text-sm font-extrabold text-white">
                {start + i}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <textarea
                  className="min-h-28 rounded-xl border-2 border-ink bg-white px-3 py-2"
                  value={p}
                  maxLength={MAX_PART}
                  placeholder={start + i === 1 ? "So Mr X and I met at…" : "And then…"}
                  onChange={(e) => onParts(parts.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <div className="flex justify-between text-xs font-bold text-ink/50">
                  <span>{p.length}/{MAX_PART}</span>
                  {parts.length > 1 && (
                    <button type="button" className="underline underline-offset-2" onClick={() => onParts(parts.filter((_, j) => j !== i))}>
                      Remove this post
                    </button>
                  )}
                </div>
                {mine.length > 0 && (
                  <>
                    <Marked text={p} findings={mine} />
                    <Findings findings={mine} onFix={fix} onKeep={keep} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn-secondary self-start" onClick={() => onParts([...parts, ""])}>
        + Add to the thread
      </button>
    </div>
  );
}

/** Whether anything still blocks posting (contact details). */
export function hasBlocking(title: string, parts: string[]) {
  return checkStory(title, parts).some((f) => f.blocking);
}
