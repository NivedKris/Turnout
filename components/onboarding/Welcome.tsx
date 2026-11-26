"use client";

import { useEffect, useState } from "react";
import { TurnoutMark } from "@/components/brand/Logo";
import GlitchText from "@/components/reactbits/GlitchText";
import LetterGlitch from "@/components/reactbits/LetterGlitch";

/** sessionStorage key: the welcome shows once per browser session. Scripts set it to skip. */
export const WELCOME_KEY = "tn-intro";

/**
 * Runs in <head> before first paint: the welcome only shows when a session starts
 * on the base URL. Otherwise it is hidden by CSS before it can flash.
 */
export const welcomeScript = `try{var s=sessionStorage;if(location.pathname!=="/"||s.getItem("${WELCOME_KEY}")==="1"){s.setItem("${WELCOME_KEY}","1");document.documentElement.dataset.welcomed="1"}}catch(e){document.documentElement.dataset.welcomed="1"}`;

/** Critical welcome CSS, inlined in <head> so it applies before first paint. */
export const welcomeStyle = `html[data-welcomed="1"] .tn-welcome { display: none; }
.tn-welcome-out { animation: tn-welcome-out 750ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
.tn-welcome-out .tn-welcome-body { animation: tn-welcome-zoom 750ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }
@keyframes tn-welcome-out { 0% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
@keyframes tn-welcome-zoom { to { transform: scale(1.08); filter: blur(6px); } }
@media (prefers-reduced-motion: reduce) {
  .tn-welcome-out .tn-welcome-body { animation: none; }
}`;

/**
 * Welcome: the Turnout mark and name, centred on a faint dot-matrix field, and
 * "Press anywhere to continue". Any click or key fades it into the overview.
 */
export function Welcome() {
  const [show, setShow] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [light, setLight] = useState(false);

  useEffect(() => {
    if (document.documentElement.dataset.welcomed === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- decided by the head script
      setShow(false);
      return;
    }
    setLight(document.documentElement.dataset.theme === "light");
  }, []);

  useEffect(() => {
    if (!show || leaving) return;
    if (document.documentElement.dataset.welcomed === "1") return;
    const go = () => {
      setLeaving(true);
      try {
        sessionStorage.setItem(WELCOME_KEY, "1");
      } catch {}
      setTimeout(() => {
        document.documentElement.dataset.welcomed = "1";
        setShow(false);
        window.dispatchEvent(new Event("turnout:welcome-done"));
      }, 750);
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
  }, [show, leaving]);

  if (!show) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Turnout. Press anywhere to continue."
      className={`tn-welcome fixed inset-0 z-[120] flex cursor-pointer select-none items-center justify-center bg-bg text-fg ${leaving ? "tn-welcome-out" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] [mask-image:radial-gradient(ellipse_at_center,transparent_28%,black_80%)]">
        <LetterGlitch
          glitchColors={light ? ["#e6e6e6", "#c4c4c4", "#7a7a7a"] : ["#1a1a1a", "#4d4d4d", "#bdbdbd"]}
          characters="TURNOUT0123456789·:/<>=+-"
          glitchAmount={0.04}
          speed={0.5}
          density={0.9}
          interactive={false}
          intro={false}
          backgroundColor="transparent"
        />
      </div>

      <div className="tn-welcome-body relative flex flex-col items-center gap-8 px-4 text-center">
        <TurnoutMark size={112} boot className="text-fg" />
        <GlitchText mode="scan" trigger="always" intensity={0.25} shadowColors={["#7a7a7a", "#e5e5e5"]} className="font-dot text-6xl font-bold tracking-[0.16em] sm:text-8xl">
          TURNOUT
        </GlitchText>
        <p className="tn-blink mt-4 font-mono text-[12px] uppercase tracking-[0.32em] text-fg-2 sm:text-[13px]">Press anywhere to continue</p>
      </div>
    </div>
  );
}
