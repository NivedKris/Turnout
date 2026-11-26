import { TurnoutMark } from "@/components/brand/Logo";

/** Root fallback (outside the dashboard shell): a small, centred mark. */
export default function Loading() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-bg" role="status" aria-label="Loading Turnout">
      <div className="flex flex-col items-center gap-4">
        <TurnoutMark size={56} boot />
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-fg-3">Loading</span>
      </div>
    </div>
  );
}
