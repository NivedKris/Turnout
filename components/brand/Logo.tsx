import type { CSSProperties } from "react";

/**
 * Turnout mark: a 7×7 LED matrix spelling a "T", read as a turnstile seen from above.
 * Lit dots are full-intensity; unlit dots form the faint matrix behind it.
 * `boot` staggers the lit dots in (CSS only, disabled under reduced motion).
 */
const N = 7;
const LIT = new Set<string>([
  // top bar
  ...[0, 1, 2, 3, 4, 5, 6].map((x) => `${x},0`),
  ...[1, 2, 3, 4, 5].map((x) => `${x},1`),
  // stem
  ...[2, 3, 4, 5, 6].map((y) => `3,${y}`),
  "2,6",
  "4,6",
]);

export function TurnoutMark({
  size = 28,
  boot = false,
  className = "",
  title = "Turnout",
}: {
  size?: number;
  boot?: boolean;
  className?: string;
  title?: string;
}) {
  const cell = 10;
  const r = 3.1;
  const dots: { x: number; y: number; lit: boolean; i: number }[] = [];
  let litIndex = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const lit = LIT.has(`${x},${y}`);
      dots.push({ x, y, lit, i: lit ? litIndex++ : 0 });
    }
  return (
    <svg
      viewBox={`0 0 ${N * cell} ${N * cell}`}
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={`${boot ? "tn-boot" : ""} ${className}`}
    >
      {dots.map((d) => (
        <circle
          key={`${d.x}-${d.y}`}
          cx={d.x * cell + cell / 2}
          cy={d.y * cell + cell / 2}
          r={r}
          fill="currentColor"
          opacity={d.lit ? 1 : 0.14}
          className={d.lit ? "tn-lit" : undefined}
          style={d.lit ? ({ "--i": d.i } as CSSProperties) : undefined}
        />
      ))}
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <TurnoutMark size={22} />
      <span className="font-dot text-[22px] font-bold leading-none tracking-[0.08em]">TURNOUT</span>
    </span>
  );
}
