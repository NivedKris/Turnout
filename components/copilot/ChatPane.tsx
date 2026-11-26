"use client";

import { useEffect, useRef, useState } from "react";
import LatticeLoader from "@/components/reactbits/LatticeLoader";
import { useCopilot } from "./CopilotProvider";
import { MessageView } from "./MessageView";

export const SUGGESTED = [
  "Are we on track for the stretch target?",
  "Where's our biggest bottleneck?",
  "Which campaign should we cut?",
  "What if show-up drops to 60%?",
  "Create a task to fix the worst campaign",
  "What changed recently?",
];

/** Conversation + input, shared by the drawer and the terminal. */
export function ChatPane({ onTrace }: { onTrace?: (id: string) => void }) {
  const { messages, sendMessage, status, error, stop, asOf, setMessages } = useCopilot();
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    void sendMessage({ text: text.trim() });
    setInput("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-fg-2">
              Ask about this campaign. Every number comes from the analytics engine via tools, and the trace shows exactly what ran. Answers use the as-of date{asOf ? ` (${asOf})` : ""}.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => submit(s)} className="border border-line px-2 py-1 text-left text-[12px] text-fg-2 hover:border-fg hover:text-fg">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-5">
          {messages.map((m) => (
            <MessageView key={m.id} m={m} onTrace={onTrace} />
          ))}
        </div>
        {busy && (
          <div className="mt-4 flex items-center gap-3">
            <LatticeLoader label={status === "submitted" ? "ROUTING" : "ANALYSING"} pattern="spiral" grid={3} shape="round" color="var(--text)" cellSize={5} gap={2} fontSize={10} />
            <button onClick={() => stop()} className="font-mono text-[10px] text-fg-3 hover:text-fg">
              STOP
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 border border-fg px-2 py-1 font-mono text-[11px]">
            ✕ {error.message || "The copilot hit an error."} Dashboard data is unaffected.
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 border-t border-line p-2"
      >
        <span className="font-mono text-[12px] text-fg-3" aria-hidden>
          ›
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "Working…" : "Ask the growth analyst…"}
          aria-label="Ask the copilot"
          className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[13px] outline-none placeholder:text-fg-3"
        />
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} className="font-mono text-[10px] text-fg-3 hover:text-fg" title="Clear conversation">
            CLR
          </button>
        )}
        <button type="submit" disabled={busy || !input.trim()} className="bg-fg px-3 py-1.5 font-mono text-[11px] font-bold tracking-widest text-bg disabled:opacity-40">
          GO
        </button>
      </form>
    </div>
  );
}
