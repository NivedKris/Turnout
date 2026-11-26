"use client";

import SplitFlapText from "@/components/reactbits/SplitFlapText";

/** Departure-board countdown to the event, relative to the as-of date. */
export function Countdown({ phase, daysToEvent }: { phase: string; daysToEvent: number }) {
  const text =
    phase === "post_event" ? "EVENT OVER" : phase === "during_event" ? "LIVE NOW" : phase === "before_history" ? "PRE-LAUNCH" : `T-${daysToEvent} DAYS`;
  return (
    <span aria-label={text}>
      <SplitFlapText key={text} text={text} tileColor="var(--surface-2)" textColor="var(--text)" fontSize={20} loop={false} intro padTo={text.length} />
    </span>
  );
}
