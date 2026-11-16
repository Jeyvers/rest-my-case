import { ContractStatus } from "@/components/ContractStatus";
import { ExampleCases } from "@/components/ExampleCases";
import { LoginButton } from "@/components/LoginButton";
import { Scales } from "@/components/Scales";
import { formatDay, lockedView, utcDay } from "@/lib/daily";
import { network } from "@/lib/network";
import { caseForDay, dailyView } from "@/lib/server/daily";
import { DailyGame } from "./daily/[day]/DailyGame";
import { HotNow } from "./daily/[day]/HotNow";

const MODES = [
  {
    title: "Ask the jury",
    meta: "Just your side",
    body: "Write what happened. The jury says whether you're right or wrong. Only you pay.",
    color: "bg-side-a",
  },
  {
    title: "Settle it together",
    meta: "Both sides",
    body: "Send the other person a private invite. They write their side and pay the same fee. The jury picks a winner.",
    color: "bg-side-b",
  },
];

const STEPS = [
  { title: "Make your case", body: "Write what happened, pick a mode, and pick Standard or Fast." },
  {
    title: "Call them out (optional)",
    body: "Settling it together? Send the private invite. They write their side and pay the same fee.",
  },
  { title: "Jury's drawn", body: "5 verified people are picked at random and vote in secret." },
  { title: "Verdict!", body: "Votes are revealed. Jurors who voted on time share the fees." },
];

const PITCH = (
  <p className="max-w-md text-lg text-white/90">
    Can&apos;t agree? Put it to a jury. 5 random, verified people read both sides, vote in secret, and settle it. Small
    fee in G$. No verdict, money back.
  </p>
);

/** Shown only on a day with no approved Daily Case: the original hand-written example. */
function StaticHero() {
  return (
    <>
      <p className="max-w-xl rounded-2xl bg-white/10 px-4 py-3 text-left text-sm leading-relaxed text-white/90 sm:px-5 sm:text-base">
        I can&apos;t have kids, so my best friend became our surrogate. Two years later, a DNA test showed my husband is
        our son&apos;s father, but I&apos;m not his mother. My husband admitted he&apos;d been sleeping with her the whole
        time we were &ldquo;trying.&rdquo; I&apos;m divorcing him and giving up my rights to the boy. My husband, my
        ex-friend and my own family all call me heartless for abandoning a child.
      </p>

      {/* The face-off: side A vs side B, weighed on the scales */}
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <div className="-rotate-3 rounded-2xl border-[3px] border-ink bg-side-a px-3 py-4 shadow-[0_6px_0_0_var(--color-ink)]">
          <p className="font-display text-xl font-extrabold sm:text-3xl">Me</p>
          <p className="text-sm font-semibold text-white/90">&ldquo;Am I the asshole?&rdquo;</p>
        </div>
        <Scales animated className="h-28 w-28 drop-shadow-[0_4px_0_rgba(27,16,53,0.35)] sm:h-36 sm:w-36" />
        <div className="rotate-3 rounded-2xl border-[3px] border-ink bg-side-b px-3 py-4 shadow-[0_6px_0_0_var(--color-ink)]">
          <p className="font-display text-xl font-extrabold sm:text-3xl">My family</p>
          <p className="text-sm font-semibold text-white/90">&ldquo;You need to forgive him.&rdquo;</p>
        </div>
      </div>
      {PITCH}
      <LoginButton />
    </>
  );
}

function prevDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Home leads with today's Daily Case, playable before signing in: the game is the hook, and signing in is what
 * gets your pick counted. Pitch and how-it-works follow underneath.
 */
export default async function Home() {
  const today = utcDay();
  const [view, prev] = await Promise.all([
    dailyView(today).catch(() => null),
    caseForDay(prevDay(today)).catch(() => null),
  ]);

  return (
    <>
      <section className={`bg-court pt-8 text-white ${view ? "pb-20" : "pb-14"}`}>
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 text-center">
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
            You be the judge.
          </h1>
          {view ? (
            <div className="flex items-center gap-3">
              <Scales animated className="h-14 w-14 shrink-0 drop-shadow-[0_3px_0_rgba(27,16,53,0.35)]" />
              <p className="text-left text-lg text-white/90">
                Today&apos;s case is below. Read it, call it, then see if you were right.
              </p>
            </div>
          ) : (
            <StaticHero />
          )}
        </div>
      </section>

      <div className="mx-auto flex max-w-2xl flex-col gap-12 px-4 py-10">
        {view && (
          <div className="-mt-24 flex flex-col gap-10">
            <div className="tile p-4 sm:p-6">
              <DailyGame initial={lockedView(view)} prevDay={prev ? prevDay(today) : null} dateLabel={formatDay(today)} heading="h2" />
            </div>
            <HotNow />
            <section className="tile flex flex-col items-center gap-4 bg-court p-6 text-center text-white">
              <p className="font-display text-2xl font-extrabold">Got your own argument?</p>
              {PITCH}
              <LoginButton />
            </section>
          </div>
        )}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold">You be the jury</h2>
            <p className="text-ink/70">Real kinds of arguments people bring. Read the story, pick a side.</p>
          </div>
          <ExampleCases />
          <p className="text-sm text-ink/60">
            Cases are public, so describe people by role (&ldquo;my roommate&rdquo;), never by name. A verdict is
            an honest outside opinion, not a legal ruling.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-extrabold">Two ways to settle it</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODES.map((m) => (
              <div key={m.title} className="tile flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full border-2 border-ink ${m.color}`} />
                  <p className="font-display text-lg font-extrabold">{m.title}</p>
                  <span className="text-sm text-ink/60">{m.meta}</span>
                </div>
                <p className="text-sm text-ink/75">{m.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-extrabold">Pick your speed</h2>
          <ContractStatus />
          <p className="text-sm text-ink/60">Live from {network.label}.</p>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="font-display text-2xl font-extrabold">How a case plays out</h2>
          <ol className="relative flex flex-col gap-5 before:absolute before:bottom-12 before:left-[1.35rem] before:top-6 before:border-l-4 before:border-dashed before:border-court/30">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex items-start gap-4">
                <span
                  className={`z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-ink font-display text-lg font-extrabold ${
                    i === STEPS.length - 1 ? "bg-verdict" : "bg-white"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="pt-1.5">
                  <p className="font-display text-lg font-bold">{s.title}</p>
                  <p className="text-ink/75">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="tile flex flex-col gap-2 p-5">
          <h2 className="font-display text-2xl font-extrabold">Or sit on the jury</h2>
          <p className="text-ink/75">
            Join the jury pool for free and get drawn at random to decide real cases. Vote on time and you share
            the fees from that case. Leave any time.
          </p>
        </section>
      </div>
    </>
  );
}
