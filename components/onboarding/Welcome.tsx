"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TurnoutMark } from "@/components/brand/Logo";
import GlitchText from "@/components/reactbits/GlitchText";
import LetterGlitch from "@/components/reactbits/LetterGlitch";
import { withAsOf } from "@/components/shell/nav";

/** sessionStorage key: the welcome shows once per browser session. Scripts set it to skip. */
export const WELCOME_KEY = "tn-intro";

const KEYS = [
  ["REG", "Registrations"],
  ["FUNL", "Funnel"],
  ["CMP", "Campaigns"],
  ["BETS", "Strategy"],
  ["TERM", "Copilot terminal"],
  ["⌘J", "Voice"],
];

/**
 * Welcome gate: full-screen dot-matrix title card with a terminal header and
 * function-key strip. Any click or key continues to the overview.
 */
export function Welcome() {
  const router = useRouter();
  const pathname = usePathname();
  const asOf = useSearchParams().get("asOf");
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [clock, setClock] = useState("");
  const [light, setLight] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(WELCOME_KEY) === "1";
    } catch {}
    if (seen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only gate
    setShow(true);
    setLight(document.documentElement.dataset.theme === "light");
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!show) return;
    const go = () => {
      if (leaving) return;
      setLeaving(true);
      try {
        sessionStorage.setItem(WELCOME_KEY, "1");
      } catch {}
      if (pathname !== "/") router.push(withAsOf("/", asOf));
      setTimeout(() => {
        setShow(false);
        window.dispatchEvent(new Event("turnout:welcome-done"));
      }, 380);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      go();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", go);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", go);
    };
  }, [show, leaving, pathname, asOf, router]);

  if (!show) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Turnout. Press anywhere to continue."
      className={`fixed inset-0 z-[120] flex cursor-pointer select-none flex-col bg-bg text-fg transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.22] [mask-image:radial-gradient(ellipse_at_center,transparent_22%,black_78%)]">
        <LetterGlitch
          glitchColors={light ? ["#e6e6e6", "#c4c4c4", "#7a7a7a"] : ["#1a1a1a", "#4d4d4d", "#bdbdbd"]}
          characters="TURNOUT0123456789·:/<>=+-"
          glitchAmount={0.05}
          speed={0.5}
          density={0.9}
          interactive={false}
          intro={false}
          backgroundColor="transparent"
        />
      </div>

      {/* terminal header */}
      <header className="relative flex items-center gap-3 border-b border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-2 md:px-6">
        <span className="bg-fg px-1.5 py-px font-bold text-bg">TURNOUT</span>
        <span className="hidden sm:inline">Attendee growth terminal</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" aria-hidden />
          Live
        </span>
        <span className="tabular text-fg">{clock} IST</span>
      </header>

      {/* title card */}
      <main className="relative flex flex-1 flex-col items-center justify-center gap-7 px-4 text-center">
        <TurnoutMark size={104} boot className="text-fg" />
        <GlitchText mode="scan" trigger="always" intensity={0.3} shadowColors={["#7a7a7a", "#e5e5e5"]} className="font-dot text-6xl font-bold tracking-[0.14em] sm:text-8xl">
          TURNOUT
        </GlitchText>
        <p className="font-mono text-[12px] uppercase tracking-[0.3em] text-fg-2">Measure · Diagnose · Decide · Manage</p>
        <p className="tn-blink mt-6 font-mono text-[13px] uppercase tracking-[0.28em] text-fg">
          <span aria-hidden>▶ </span>Press anywhere to continue
        </p>
      </main>

      {/* function-key strip */}
      <footer className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-fg-3">
        {KEYS.map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <kbd className="rounded-[3px] bg-fg px-1.5 py-px font-bold text-bg">{k}</kbd>
            {label}
          </span>
        ))}
      </footer>
    </div>
  );
}
