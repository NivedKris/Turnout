"use client";

import { useEffect, useState } from "react";
import GlitchText from "@/components/reactbits/GlitchText";
import LatticeLoader from "@/components/reactbits/LatticeLoader";
import LetterGlitch from "@/components/reactbits/LetterGlitch";
import TextType from "@/components/reactbits/TextType";
import { TurnoutMark } from "./Logo";

const BOOT_LINES = [
  "› TURNOUT GROWTH CENTER",
  "› handshake  mongodb atlas ........ ok",
  "› snapshot   end-of-day IST ....... ok",
  "› rules      dedup · external · verified",
  "› engine     funnel · rules · projection",
  "› ready.",
];

/**
 * Turnout boot screen. Used as the route loading UI and as a one-time intro.
 * Monochrome LetterGlitch field, glitching wordmark, typed boot log and a lattice loader.
 * Under reduced motion it renders as a still frame.
 */
export function BootScreen({ label = "LOADING", overlay = false }: { label?: string; overlay?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Turnout ${label.toLowerCase()}`}
      className={`${overlay ? "fixed inset-0 z-[100]" : "relative min-h-[560px] w-full flex-1"} flex items-center justify-center overflow-hidden bg-bg`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.22] [mask-image:radial-gradient(ellipse_at_center,transparent_18%,black_75%)]">
        <LetterGlitch
          glitchColors={["#1f1f1f", "#4d4d4d", "#bdbdbd"]}
          characters="TURNOUT0123456789·:/<>=+-"
          glitchAmount={0.06}
          speed={0.6}
          density={0.9}
          interactive={false}
          intro={false}
          backgroundColor="transparent"
        />
      </div>

      <div className="relative flex w-[min(92vw,460px)] flex-col items-center gap-6">
        <TurnoutMark size={72} boot className="text-fg" />
        <GlitchText
          mode="scan"
          trigger="always"
          intensity={0.35}
          shadowColors={["#7a7a7a", "#e5e5e5"]}
          className="font-dot text-5xl font-bold tracking-[0.12em] text-fg"
        >
          TURNOUT
        </GlitchText>

        <div className="w-full rounded-md border border-line bg-bg/80 p-3 font-mono text-[11px] leading-5 text-fg-2 backdrop-blur">
          <TextType
            text={BOOT_LINES.join("\n")}
            as="pre"
            typingSpeed={12}
            initialDelay={120}
            loop={false}
            showCursor
            cursorStyle="block"
            className="whitespace-pre-wrap"
          />
        </div>

        <LatticeLoader
          label={label}
          pattern="snake"
          grid={4}
          shape="round"
          color="var(--text)"
          cellSize={7}
          gap={3}
          fontSize={11}
          showTimer
          elapsed={elapsed}
        />
      </div>
    </div>
  );
}

/** Shows the boot screen once per browser session on first load, then fades out. */
export function IntroGate() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("tn-intro") === "1";
      sessionStorage.setItem("tn-intro", "1");
    } catch {
      seen = true;
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only intro
    setShow(true);
    const id = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div className="tn-fade-out">
      <BootScreen overlay label="BOOTING" />
    </div>
  );
}
