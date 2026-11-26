"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { withAsOf } from "@/components/shell/nav";
import { WELCOME_KEY } from "./Welcome";

/** localStorage key: set once the tour is finished or skipped, so it only auto-starts on a first visit. */
export const TOUR_KEY = "tn-tour";

type Step = { target: string | null; title: string; body: string; cta?: { label: string; href: string }; feature?: boolean };

const STEPS: Step[] = [
  { target: null, title: "Welcome to Turnout", body: "A growth terminal for the festival's attendee goal. It measures the funnel, finds the bottleneck, recommends what to do and tracks who does it. This tour takes about a minute." },
  { target: "kpis", title: "The numbers that decide it", body: "Visitors, registrations and spend against their goals, with the projection to event day. Click any metric to open its full drill-down." },
  { target: "asof", title: "Travel in time", body: "Every screen is computed as of a date. Jump to launch, the decision point or event day to see exactly what was known then." },
  { target: "actions", title: "What to do next", body: "Actions ranked by their impact on the visitor goal, straight from the rules engine. Each one becomes a task in one click." },
  { target: "rail", title: "Measure · Strategy · Execute", body: "Funnel and campaigns to measure, goal plan and bets for strategy, decisions, tasks and team to execute." },
  { target: "command", title: "Command line", body: "Type a code like REG or FUNL and press Enter, or type a question to send it to the copilot. ⌘K jumps here." },
  {
    target: "terminal",
    title: "Copilot terminal",
    body: "Ask anything in plain English. Every answer comes with its execution trace: which model ran, which tools and rules it used, and whether each number is grounded in the data. This is the place to check the reasoning.",
    cta: { label: "Open the terminal", href: "/terminal" },
    feature: true,
  },
  { target: "assistant", title: "Or just talk", body: "⌘J starts voice. Say “take me to paid social” or “are we on track?”. Changes always wait for your yes. ⌘I opens the typed chat." },
  { target: "help", title: "Replay anytime", body: "Press Help to see this tour again." },
];

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const CARD_W = 360;

function startEvent() {
  window.dispatchEvent(new Event("turnout:tour"));
}

/** Header button that replays the tour. */
export function HelpButton() {
  return (
    <button
      data-tour="help"
      onClick={startEvent}
      aria-label="Help: replay the tour"
      title="Replay the tour"
      className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-2 hover:border-fg-2 hover:text-fg"
    >
      <span className="grid h-4 w-4 place-items-center rounded-full bg-fg font-mono text-[10px] font-bold text-bg">?</span>
      Help
    </button>
  );
}

/**
 * Spotlight tour. Auto-starts on a first visit (no flag in this browser) once the
 * welcome is dismissed; Help replays it. ←/→ move, Esc skips.
 */
export function Tour() {
  const router = useRouter();
  const pathname = usePathname();
  const asOf = useSearchParams().get("asOf");
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_KEY, "done");
    } catch {}
    setI(null);
    setRect(null);
  }, []);

  const start = useCallback(() => {
    if (window.location.pathname !== "/") router.push(withAsOf("/", new URLSearchParams(window.location.search).get("asOf")));
    setI(0);
  }, [router]);

  // First visit: start after the welcome (or straight away if it was already seen this session).
  useEffect(() => {
    const firstVisit = () => {
      try {
        return !localStorage.getItem(TOUR_KEY);
      } catch {
        return false;
      }
    };
    const onWelcome = () => firstVisit() && start();
    const onReplay = () => start();
    window.addEventListener("turnout:welcome-done", onWelcome);
    window.addEventListener("turnout:tour", onReplay);
    let seenWelcome = false;
    try {
      seenWelcome = sessionStorage.getItem(WELCOME_KEY) === "1";
    } catch {}
    const t = seenWelcome && firstVisit() ? setTimeout(start, 600) : null;
    return () => {
      window.removeEventListener("turnout:welcome-done", onWelcome);
      window.removeEventListener("turnout:tour", onReplay);
      if (t) clearTimeout(t);
    };
  }, [start]);

  // Find the target (it may still be streaming in), scroll it into view, then track it.
  const step = i === null ? null : STEPS[i]!;
  useLayoutEffect(() => {
    if (!step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    let el: Element | null = null;
    let tries = 0;
    let poll: ReturnType<typeof setInterval> | null = null;
    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return setRect(null);
      // Tall targets (the rail) are clipped to the viewport below the header.
      const tall = r.height > window.innerHeight * 0.5;
      const top = tall ? Math.max(r.top, 56) : r.top;
      const bottom = tall ? Math.min(r.bottom, window.innerHeight - 8) : r.bottom;
      setRect({ top: top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: Math.max(0, bottom - top) + PAD * 2 });
    };
    const find = () => {
      el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el || ++tries > 40) {
        if (poll) clearInterval(poll);
        if (!el) return setRect(null);
        const r = el.getBoundingClientRect();
        if (r.top < 60 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
        measure();
        setTimeout(measure, 380);
      }
    };
    find();
    if (!el) poll = setInterval(find, 125);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      if (poll) clearInterval(poll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, pathname]);

  useEffect(() => {
    if (i === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") setI((n) => (n === null ? n : n + 1 >= STEPS.length ? (finish(), null) : n + 1));
      else if (e.key === "ArrowLeft") setI((n) => (n ? n - 1 : n));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [i, finish]);

  if (i === null || !step) return null;
  const last = i === STEPS.length - 1;

  // Card placement: below, above, right, left of the target, else centred.
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const w = Math.min(CARD_W, vw - 32);
  const H = 240;
  let pos: React.CSSProperties = { left: (vw - w) / 2, top: Math.max(16, (vh - H) / 2) };
  if (rect) {
    const clampX = (x: number) => Math.min(Math.max(16, x), vw - w - 16);
    if (rect.top + rect.height + 12 + H < vh) pos = { left: clampX(rect.left), top: rect.top + rect.height + 12 };
    else if (rect.top - 12 - H > 0) pos = { left: clampX(rect.left), top: rect.top - 12 - H };
    else if (rect.left + rect.width + 12 + w < vw) pos = { left: rect.left + rect.width + 12, top: Math.min(Math.max(16, rect.top), vh - H - 16) };
    else if (rect.left - 12 - w > 0) pos = { left: rect.left - 12 - w, top: Math.min(Math.max(16, rect.top), vh - H - 16) };
  }

  return (
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true" aria-label={`Tour step ${i + 1} of ${STEPS.length}: ${step.title}`}>
      {/* backdrop with a hole over the target */}
      {rect ? (
        <div
          aria-hidden
          className={`tn-spot pointer-events-none fixed rounded-2xl transition-all duration-300 ${step.feature ? "tn-spot-feature" : ""}`}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/75" />
      )}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div className="tn-dock tn-card-in fixed rounded-2xl p-4" style={{ ...pos, width: w }}>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-3">
          <span className="bg-fg px-1 py-px font-bold text-bg">TOUR</span>
          <span className="tabular">
            {String(i + 1).padStart(2, "0")}/{String(STEPS.length).padStart(2, "0")}
          </span>
          <span className="ml-auto flex gap-1" aria-hidden>
            {STEPS.map((_, k) => (
              <span key={k} className={`h-1.5 w-1.5 rounded-full ${k <= i ? "bg-fg" : "bg-fg/20"}`} />
            ))}
          </span>
        </div>
        <h2 className="mt-3 font-dot text-[22px] font-bold leading-tight tracking-wide">{step.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{step.body}</p>
        {step.cta && (
          <Link
            href={withAsOf(step.cta.href, asOf)}
            onClick={finish}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-fg px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-fg hover:bg-fg hover:text-bg"
          >
            ▶ {step.cta.label}
          </Link>
        )}
        <div className="mt-4 flex items-center gap-2">
          <button onClick={finish} className="text-[12px] text-fg-3 underline-offset-2 hover:text-fg hover:underline">
            Skip tour
          </button>
          <span className="ml-auto" />
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:border-fg">
              Back
            </button>
          )}
          <button
            autoFocus
            onClick={() => (last ? finish() : setI(i + 1))}
            className="rounded-full bg-fg px-4 py-1 text-[12px] font-medium text-bg hover:opacity-90"
          >
            {last ? "Finish" : i === 0 ? "Start" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
