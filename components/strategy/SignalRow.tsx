import { GlyphIcon } from "@/components/matrix/primitives";
import type { SignalResult, SignalState } from "@/lib/analytics";
import type { Glyph } from "@/lib/ui/status";

const STATE: Record<SignalState, { glyph: Glyph; label: string }> = {
  scale: { glyph: "solid", label: "Scale" },
  watch: { glyph: "half", label: "Watch" },
  stop: { glyph: "hollow", label: "Stop" },
  insufficient: { glyph: "dotted", label: "Too early" },
  not_yet: { glyph: "dotted", label: "From event day" },
};

export const fmtSignal = (metric: string, v: number | null) => {
  if (v === null) return "—";
  if (metric === "cost_per_registration" || metric === "cost_per_visitor") return `₹${Math.round(v).toLocaleString("en-IN")}`;
  if (metric === "registrations_per_day") return v.toFixed(1);
  return `${(v * 100).toFixed(1)}%`;
};

export function SignalState({ state }: { state: SignalState }) {
  const s = STATE[state];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-fg-2">
      <GlyphIcon glyph={s.glyph} size={10} className="text-fg" />
      {s.label}
    </span>
  );
}

/** One early signal: value, the two lines, and where it sits. */
export function SignalRow({ sg, compact = false }: { sg: SignalResult; compact?: boolean }) {
  const lower = sg.direction === "lower_is_better";
  return (
    <div className={`flex items-center gap-3 ${compact ? "py-1.5" : "py-2.5"} border-t border-line first:border-t-0`}>
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">{sg.label}</span>
      <span className="font-mono text-[14px] font-semibold tabular">{fmtSignal(sg.metric, sg.value)}</span>
      {!compact && (
        <span className="hidden w-44 text-right text-[11px] text-fg-3 md:inline">
          scale {lower ? "≤" : "≥"} {fmtSignal(sg.metric, sg.scale_if)} · stop {lower ? "≥" : "≤"} {fmtSignal(sg.metric, sg.stop_if)}
        </span>
      )}
      <span className="w-28 text-right">
        <SignalState state={sg.state} />
      </span>
    </div>
  );
}
