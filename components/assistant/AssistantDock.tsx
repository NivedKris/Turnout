"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TurnoutMark } from "@/components/brand/Logo";
import { useCopilot } from "@/components/copilot/CopilotProvider";
import { Markdown } from "@/components/copilot/Markdown";
import { applyProposal, rejectProposal } from "./apply";
import type { LiveVoice } from "./live";
import { go } from "./screen";
import { assistant, useAssistant, type Card, type LiveStatus } from "./store";

/**
 * The in-app assistant, bottom centre on every screen: a Turnout mark whose dot
 * shows the state, a glass voice bar with live captions, cards above it (details,
 * "Take me there?", proposals to accept) and a short travel overlay on navigation.
 * ⌘J toggles voice; "Chat" opens the typed copilot with the same tools.
 */
const DOT: Record<LiveStatus, string> = {
  idle: "#22c55e",
  connecting: "#f59e0b",
  listening: "#6ee7b7",
  thinking: "#f59e0b",
  speaking: "#60a5fa",
  error: "#ef4444",
};
const WORD: Record<LiveStatus, string> = {
  idle: "Ask Turnout",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice off",
};

export function AssistantDock() {
  const router = useRouter();
  const { setOpen } = useCopilot();
  const voiceOn = useAssistant((s) => s.voiceOn);
  const status = useAssistant((s) => s.status);
  const heard = useAssistant((s) => s.heard);
  const caption = useAssistant((s) => s.caption);
  const cards = useAssistant((s) => s.cards);
  const live = useRef<LiveVoice | null>(null);
  const nav = useRef({ push: (p: string) => router.push(p), back: () => router.back(), refresh: () => router.refresh() });
  nav.current = { push: (p) => router.push(p), back: () => router.back(), refresh: () => router.refresh() };

  const toggle = async () => {
    if (live.current && assistant.get().voiceOn) {
      if (assistant.get().status === "speaking") return live.current.interrupt();
      live.current.stop();
      live.current = null;
      return;
    }
    const { LiveVoice } = await import("./live"); // keeps @google/genai out of the first load
    live.current = new LiveVoice({ push: (p) => nav.current.push(p), back: () => nav.current.back(), refresh: () => nav.current.refresh() });
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __turnout: live.current, __turnoutStore: assistant });
    void live.current.start();
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        void toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      live.current?.stop();
    };
  }, []);

  const active = voiceOn || status === "error";
  const glow = voiceOn && (status === "listening" || status === "thinking");

  return (
    <>
      {glow && <div aria-hidden className={`tn-edge-glow ${status === "thinking" ? "tn-edge-think" : ""}`} />}
      <Travel />
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[45] flex flex-col items-center gap-2 px-4">
        {cards.length > 0 && (
          <div className="pointer-events-auto flex w-full max-w-[560px] flex-col gap-2">
            {cards.map((c) => (
              <CardView key={c.id} card={c} onGo={(path, label) => go(nav.current, path, label)} />
            ))}
          </div>
        )}
        <div
          className={`tn-dock pointer-events-auto flex items-center gap-3 rounded-full shadow-lg transition-all duration-300 ${active ? "w-full max-w-[560px] py-1.5 pl-1.5 pr-2" : "py-1.5 pl-1.5 pr-4"}`}
          role="region"
          aria-label="Turnout assistant"
        >
          <button
            onClick={() => void toggle()}
            aria-pressed={voiceOn}
            aria-label={voiceOn ? (status === "speaking" ? "Interrupt" : "Stop voice") : "Talk to Turnout (⌘J)"}
            title={voiceOn ? (status === "speaking" ? "Tap to interrupt" : "Tap to stop") : "Talk to Turnout · ⌘J"}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-bg"
          >
            <Level />
            <TurnoutMark size={20} title="" />
            <span
              className={`absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface-2)] ${status === "thinking" || status === "connecting" ? "animate-pulse" : ""}`}
              style={{ background: DOT[status] }}
            />
          </button>
          {active ? (
            <div className="min-w-0 flex-1 leading-tight" aria-live="polite">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-3">{WORD[status]}</div>
              <div className="truncate text-[13px] text-fg">
                {status === "listening" || status === "connecting" ? heard || caption || <span className="text-fg-3">Say “take me to paid social” or “are we on track?”</span> : caption || heard}
              </div>
            </div>
          ) : (
            <button onClick={() => void toggle()} className="text-[13px] font-medium text-fg">
              Ask Turnout <kbd className="ml-1 font-mono text-[11px] text-fg-3">⌘J</kbd>
            </button>
          )}
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:border-fg hover:text-fg"
            title="Open the typed copilot · ⌘I"
          >
            {active ? "Open in chat" : "Chat"}
          </button>
        </div>
      </div>
    </>
  );
}

/** Ring that breathes with the mic (listening) or the voice (speaking). */
function Level() {
  const level = useAssistant((s) => s.level);
  const status = useAssistant((s) => s.status);
  const on = status === "listening" || status === "speaking";
  return (
    <span
      aria-hidden
      className="absolute inset-0 rounded-full transition-transform duration-75"
      style={{ boxShadow: on ? `0 0 0 ${2 + level * 8}px ${status === "speaking" ? "rgba(96,165,250,.35)" : "rgba(110,231,183,.35)"}` : "none" }}
    />
  );
}

function CardView({ card, onGo }: { card: Card; onGo: (path: string, label: string) => void }) {
  const drop = () => assistant.dropCard(card.id);
  const shell = "tn-dock tn-card-in rounded-2xl p-3 shadow-lg";
  if (card.kind === "detail")
    return (
      <div className={`${shell} max-h-[42vh] overflow-auto`}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[13px] font-semibold">{card.title}</span>
          <button onClick={drop} aria-label="Close" className="ml-auto px-1 text-fg-3 hover:text-fg">✕</button>
        </div>
        <div className="text-[13px]">
          <Markdown text={card.markdown} />
        </div>
      </div>
    );
  if (card.kind === "offer")
    return (
      <div className={`${shell} flex items-center gap-3`}>
        <span className="min-w-0 flex-1 text-[13px]">{card.question}</span>
        <button
          onClick={() => {
            drop();
            onGo(card.path, card.label);
          }}
          className="rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg"
        >
          Take me there
        </button>
        <button onClick={drop} className="text-[12px] text-fg-3 hover:text-fg">Not now</button>
      </div>
    );
  if (card.kind === "proposal") return <ProposalCard id={card.proposalId} onClose={drop} />;
  return (
    <div className={`${shell} flex items-center gap-2 text-[13px]`}>
      <span className="flex-1">{card.text}</span>
      <button onClick={drop} aria-label="Close" className="px-1 text-fg-3 hover:text-fg">✕</button>
    </div>
  );
}

function ProposalCard({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const p = useAssistant((s) => s.proposals[id]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (p && p.state !== "pending") {
      const t = setTimeout(onClose, 4000);
      return () => clearTimeout(t);
    }
  }, [p, onClose]);
  if (!p) return null;
  return (
    <div className="tn-dock tn-card-in rounded-2xl p-3 shadow-lg">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-3">Proposed change · nothing saved yet</div>
      <div className="mt-1 text-[13px]">{p.summary}</div>
      {p.state === "pending" ? (
        <div className="mt-2 flex gap-2">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await applyProposal(id, () => router.refresh());
              setBusy(false);
            }}
            className="rounded-full bg-fg px-3 py-1 text-[12px] font-medium text-bg disabled:opacity-50"
          >
            {busy ? "Saving…" : "Accept"}
          </button>
          <button disabled={busy} onClick={() => rejectProposal(id)} className="rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:border-fg">
            Reject
          </button>
        </div>
      ) : (
        <div className={`mt-2 text-[12px] ${p.state === "confirmed" ? "text-[#22c55e]" : p.state === "failed" ? "text-[#ef4444]" : "text-fg-3"}`}>
          {p.state === "confirmed" ? `✓ ${p.result ?? "Done"}` : p.state === "failed" ? `Couldn't save: ${p.result}` : "Discarded. Nothing changed."}
        </div>
      )}
    </div>
  );
}

/** "Taking you to …" for under a second while the route changes. */
function Travel() {
  const travel = useAssistant((s) => s.travel);
  const [show, setShow] = useState<string | null>(null);
  useEffect(() => {
    if (!travel) return;
    setShow(travel.label);
    const t = setTimeout(() => {
      setShow(null);
      assistant.set({ travel: null });
    }, 1100);
    return () => clearTimeout(t);
  }, [travel]);
  if (!show) return null;
  return (
    <div aria-live="polite" className="tn-travel pointer-events-none fixed inset-x-0 top-[72px] z-[46] flex justify-center">
      <div className="tn-dock flex items-center gap-2 rounded-full px-4 py-2 text-[13px] shadow-lg">
        <TurnoutMark size={16} boot title="" />
        Taking you to <b className="font-semibold">{show}</b>
      </div>
    </div>
  );
}
