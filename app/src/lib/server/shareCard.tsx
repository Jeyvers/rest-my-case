import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { ImageResponse } from "next/og";

/** Share cards (Open Graph images): 1200×630, in the app's own look. Satori needs flex on every multi-child div. */
export const CARD_SIZE = { width: 1200, height: 630 };

const C = {
  court: "#3d1e8c",
  deep: "#2a1366",
  verdict: "#ffc93c",
  a: "#ff5a6e",
  b: "#14b8a6",
  ink: "#1b1035",
  lilac: "#f3eeff",
};

let fonts: Promise<{ name: string; data: Buffer; weight: 700 | 800; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Bricolage-ExtraBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Nunito-Bold.ttf")),
  ]).then(([display, body]) => [
    { name: "Display", data: display, weight: 800, style: "normal" },
    { name: "Body", data: body, weight: 700, style: "normal" },
  ]);
  return fonts;
}

/** Cuts text to n characters on a word boundary, with an ellipsis. */
export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 12)).replace(/[,.;:!?\s]+$/, "") + "…";
}

export async function card(node: ReactNode): Promise<ImageResponse> {
  return new ImageResponse(node as React.ReactElement, {
    ...CARD_SIZE,
    fonts: await loadFonts(),
    headers: { "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

function ScalesMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <rect x="56" y="30" width="8" height="70" rx="3" fill={C.ink} />
      <path d="M34 108 Q60 92 86 108 Z" fill={C.ink} />
      <rect x="30" y="104" width="60" height="9" rx="4.5" fill={C.verdict} stroke={C.ink} strokeWidth="3" />
      <rect x="14" y="30" width="92" height="8" rx="4" fill={C.verdict} stroke={C.ink} strokeWidth="3" />
      <path d="M22 36 L8 70 M22 36 L36 70" stroke={C.ink} strokeWidth="2.5" fill="none" />
      <path d="M2 70 H42 Q38 86 22 86 Q6 86 2 70 Z" fill={C.a} stroke={C.ink} strokeWidth="3" />
      <path d="M98 36 L84 70 M98 36 L112 70" stroke={C.ink} strokeWidth="2.5" fill="none" />
      <path d="M78 70 H118 Q114 86 98 86 Q82 86 78 70 Z" fill={C.b} stroke={C.ink} strokeWidth="3" />
      <circle cx="60" cy="24" r="9" fill={C.verdict} stroke={C.ink} strokeWidth="3" />
    </svg>
  );
}

/** Purple court background, brand in the top-left, a yellow pill top-right, and a footer row. */
export function Frame(props: { pill: string; children: ReactNode; cta: string; url: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.court,
        padding: "40px 52px 40px",
        fontFamily: "Body",
        color: "white",
        position: "relative",
      }}
    >
      {/* soft depth: two big darker circles behind everything */}
      <div style={{ position: "absolute", left: -180, bottom: -260, width: 620, height: 620, borderRadius: 620, background: C.deep, display: "flex" }} />
      <div style={{ position: "absolute", right: -140, top: -220, width: 480, height: 480, borderRadius: 480, background: C.deep, display: "flex" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 64, height: 64, borderRadius: 64, background: "white", alignItems: "center", justifyContent: "center", border: `4px solid ${C.ink}` }}>
            <ScalesMark size={50} />
          </div>
          <span style={{ fontFamily: "Display", fontSize: 34 }}>Rest My Case</span>
        </div>
        <div
          style={{
            display: "flex",
            background: C.verdict,
            color: C.ink,
            border: `4px solid ${C.ink}`,
            borderRadius: 999,
            padding: "8px 22px",
            fontFamily: "Display",
            fontSize: 26,
            letterSpacing: 1,
            boxShadow: `0 5px 0 0 ${C.ink}`,
          }}
        >
          {props.pill}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>{props.children}</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            background: C.verdict,
            color: C.ink,
            border: `5px solid ${C.ink}`,
            borderRadius: 24,
            padding: "12px 30px",
            fontFamily: "Display",
            fontSize: 34,
            boxShadow: `0 7px 0 0 ${C.ink}`,
          }}
        >
          {props.cta}
        </div>
        <span style={{ fontSize: 28, color: "rgba(255,255,255,0.85)" }}>{props.url}</span>
      </div>
    </div>
  );
}

export function Title({ children, size = 60 }: { children: string; size?: number }) {
  return (
    <div style={{ display: "flex", fontFamily: "Display", fontSize: size, lineHeight: 1.04, letterSpacing: -1, marginBottom: 26 }}>
      {children}
    </div>
  );
}

function SideCard(props: { side: "A" | "B"; who: string; says?: string; tilt: number; win?: boolean; dim?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        background: props.side === "A" ? C.a : C.b,
        border: `5px solid ${C.ink}`,
        borderRadius: 28,
        padding: "16px 24px 20px",
        boxShadow: `0 9px 0 0 ${C.ink}`,
        transform: `rotate(${props.tilt}deg)`,
        opacity: props.dim ? 0.55 : 1,
        position: "relative",
      }}
    >
      {props.says ? (
        <>
          <span style={{ fontSize: 22, color: "rgba(255,255,255,0.9)", textTransform: "uppercase", letterSpacing: 1.5 }}>
            {`${props.side} · ${clip(props.who, 24)}`}
          </span>
          <span style={{ fontSize: 30, lineHeight: 1.18, marginTop: 6 }}>{`“${clip(props.says, 84)}”`}</span>
        </>
      ) : (
        // Names only (the Daily Case): one big label.
        <span style={{ fontFamily: "Display", fontSize: 42, lineHeight: 1.1, padding: "10px 0" }}>
          {`${props.side} · ${clip(props.who, 22)}`}
        </span>
      )}
      {props.win && (
        <div
          style={{
            position: "absolute",
            top: -24,
            right: 18,
            display: "flex",
            background: C.verdict,
            color: C.ink,
            border: `4px solid ${C.ink}`,
            borderRadius: 999,
            padding: "2px 16px",
            fontFamily: "Display",
            fontSize: 24,
          }}
        >
          WINNER
        </div>
      )}
    </div>
  );
}

/** Side A vs Side B, with a VS badge between them. */
export function Faceoff(props: { a: { who: string; says?: string }; b: { who: string; says?: string }; winner?: "A" | "B" | null }) {
  const w = props.winner ?? null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <SideCard side="A" who={props.a.who} says={props.a.says} tilt={-2} win={w === "A"} dim={w === "B"} />
      <div
        style={{
          display: "flex",
          width: 76,
          height: 76,
          borderRadius: 76,
          background: "white",
          border: `5px solid ${C.ink}`,
          alignItems: "center",
          justifyContent: "center",
          color: C.ink,
          fontFamily: "Display",
          fontSize: 28,
          flexShrink: 0,
        }}
      >
        VS
      </div>
      <SideCard side="B" who={props.b.who} says={props.b.says} tilt={2} win={w === "B"} dim={w === "A"} />
    </div>
  );
}

/** A single story card (one-sided cases), with Right / Wrong chips. */
export function Story({ text, verdict }: { text: string; verdict?: "right" | "wrong" | null }) {
  const chip = (label: string, bg: string, on: boolean, off: boolean) => (
    <div
      style={{
        display: "flex",
        background: bg,
        border: `4px solid ${C.ink}`,
        borderRadius: 18,
        padding: "6px 26px",
        fontFamily: "Display",
        fontSize: 28,
        color: "white",
        opacity: off ? 0.45 : 1,
        boxShadow: on ? `0 0 0 6px ${C.verdict}` : "none",
      }}
    >
      {label}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "flex",
          background: "rgba(255,255,255,0.12)",
          borderRadius: 24,
          padding: "18px 26px",
          fontSize: 30,
          lineHeight: 1.25,
        }}
      >
        {`“${clip(text, 170)}”`}
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {chip("RIGHT", C.a, verdict === "right", verdict === "wrong")}
        {chip("WRONG", C.b, verdict === "wrong", verdict === "right")}
      </div>
    </div>
  );
}

/** Fallback card: just the brand and a line. */
export function Plain({ line }: { line: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
      <div style={{ display: "flex", width: 220, height: 220, borderRadius: 220, background: "white", border: `6px solid ${C.ink}`, alignItems: "center", justifyContent: "center", boxShadow: `0 10px 0 0 ${C.ink}` }}>
        <ScalesMark size={170} />
      </div>
      <div style={{ display: "flex", fontFamily: "Display", fontSize: 72, lineHeight: 1.02, letterSpacing: -1.5, flex: 1 }}>{line}</div>
    </div>
  );
}

export const siteHost = () => (process.env.APP_URL ?? "https://www.restmycase.xyz").replace(/^https?:\/\//, "").replace(/\/$/, "");

/** A white quote card with the opening lines of a text (Ex Stories). */
export function Excerpt({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        background: "white",
        color: C.ink,
        border: `5px solid ${C.ink}`,
        borderRadius: 28,
        padding: "22px 30px",
        boxShadow: `0 9px 0 0 ${C.ink}`,
        fontFamily: "Body",
        fontSize: 32,
        lineHeight: 1.3,
      }}
    >
      {`“${clip(text, 150)}”`}
    </div>
  );
}
