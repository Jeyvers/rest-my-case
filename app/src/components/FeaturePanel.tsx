"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { formatDay } from "@/lib/daily";
import { Spinner } from "./Loading";
import { ErrorNote, Hint, Panel } from "./ui";

type State = {
  eligible: boolean;
  stage: "none" | "draft" | "approved" | "scheduled" | "featured";
  featuredOn: string | null;
  party: boolean;
  iAgreed: boolean;
  allAgreed?: boolean;
  twoParties: boolean;
};

/** The "Featured" badge for everyone, and "Feature as Daily Case" for the parties once there's a verdict. */
export function FeaturePanel({ caseId }: { caseId: string }) {
  const authFetch = useAuthFetch();
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    authFetch<State>(`/api/cases/${caseId}/feature`).then(setS).catch(() => {});
  }, [authFetch, caseId]);
  useEffect(load, [load]);

  async function act(method: "POST" | "DELETE") {
    setBusy(true);
    setError(undefined);
    try {
      await authFetch(`/api/cases/${caseId}/feature`, { method });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;

  const badge = s.featuredOn && (
    <Link
      href={`/daily/${s.featuredOn}`}
      className="self-start rounded-full border-2 border-ink bg-verdict px-3 py-1 font-display text-sm font-extrabold shadow-[0_3px_0_0_var(--color-ink)]"
    >
      🌟 Featured · Case of the Day, {formatDay(s.featuredOn)}
    </Link>
  );
  if (!s.party || !s.eligible) return badge || null;
  if (s.stage === "featured") return badge;

  const waiting = s.iAgreed && s.twoParties && !s.allAgreed;
  const locked = s.stage === "scheduled";
  return (
    <Panel tone="yellow">
      <p className="font-display text-xl font-extrabold">🌟 Make it a Case of the Day?</p>
      {!s.iAgreed ? (
        <>
          <p>
            Put your case forward for the daily game, where everyone tries to guess the verdict. Names and contact details
            are removed first, and nothing goes live until it&apos;s been reviewed.
            {s.twoParties && " The other person has to agree too."}
          </p>
          <button type="button" className="btn self-start bg-white" disabled={busy} onClick={() => act("POST")}>
            {busy ? <Spinner /> : "Feature as Daily Case"}
          </button>
        </>
      ) : (
        <>
          <p>
            {waiting
              ? "You agreed. Waiting for the other person to agree too. Send them the case link."
              : locked
                ? "It's been reviewed and scheduled. You'll get an alert the day it goes live."
                : s.stage === "approved"
                  ? "Approved! It's in the line-up. You'll get an alert the day it goes live."
                  : "Sent for review. You'll get an alert the day it goes live."}
          </p>
          {!locked && (
            <button type="button" className="btn-secondary self-start" disabled={busy} onClick={() => act("DELETE")}>
              {busy ? <Spinner /> : "Withdraw"}
            </button>
          )}
          {locked && <Hint>It&apos;s scheduled, so it can no longer be withdrawn.</Hint>}
        </>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}
