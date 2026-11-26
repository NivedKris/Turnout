"use client";

import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { runScreenTool } from "@/components/assistant/screen";
import { assistant } from "@/components/assistant/store";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Trace } from "@/lib/copilot/trace-types";

export type CopilotMessage = UIMessage<never, { trace: Trace }>;

type Ctx = UseChatHelpers<CopilotMessage> & {
  open: boolean;
  setOpen: (v: boolean) => void;
  ask: (text: string) => void;
  selectedTrace: string | null;
  setSelectedTrace: (id: string | null) => void;
  asOf: string | null;
};

const CopilotCtx = createContext<Ctx | null>(null);

function sessionId() {
  try {
    let id = localStorage.getItem("tn-copilot-session");
    if (!id) {
      id = `s_${crypto.randomUUID()}`;
      localStorage.setItem("tn-copilot-session", id);
    }
    return id;
  } catch {
    return "s_ephemeral";
  }
}

/**
 * One chat shared by the drawer and the /terminal view, so a conversation
 * survives navigation. The as-of date is sent with every turn.
 */
export function CopilotProvider({ children }: { children: ReactNode }) {
  const asOf = useSearchParams().get("asOf");
  const [id] = useState(() => (typeof window === "undefined" ? "s_ssr" : sessionId()));
  const [open, setOpen] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<CopilotMessage>({
        api: "/api/chat",
        // Read the as-of date from the URL at send time so it is always the one on screen.
        prepareSendMessagesRequest: ({ messages }) => ({ body: { id, messages, asOf: new URLSearchParams(window.location.search).get("asOf") } }),
      }),
    [id],
  );
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const chatRef = useRef<UseChatHelpers<CopilotMessage> | null>(null);
  const chat = useChat<CopilotMessage>({
    id,
    transport,
    // navigate / offer_navigation run here in the browser; the reply continues automatically.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.dynamic || (toolCall.toolName !== "navigate" && toolCall.toolName !== "offer_navigation")) return;
      if (!assistant.get().entities) {
        try {
          assistant.set({ entities: await (await fetch("/api/assistant/entities")).json() });
        } catch {}
      }
      const r = routerRef.current;
      const output = await runScreenTool(toolCall.toolName, toolCall.input as Record<string, unknown>, { push: (p) => r.push(p), back: () => r.back(), refresh: () => r.refresh() });
      void chatRef.current?.addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
    },
  });
  chatRef.current = chat;

  // Command bar free text and "ask" buttons dispatch this event.
  const ask = (text: string) => {
    setOpen(true);
    void chat.sendMessage({ text });
  };
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  });
  useEffect(() => {
    const onAsk = (e: Event) => askRef.current(String((e as CustomEvent).detail ?? ""));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("turnout:ask", onAsk);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("turnout:ask", onAsk);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return <CopilotCtx.Provider value={{ ...chat, open, setOpen, ask, selectedTrace, setSelectedTrace, asOf }}>{children}</CopilotCtx.Provider>;
}

export function useCopilot() {
  const c = useContext(CopilotCtx);
  if (!c) throw new Error("useCopilot must be used inside CopilotProvider");
  return c;
}

/** Latest trace data part of a message (reconciled by id, so the last one wins). */
export function traceOf(m: CopilotMessage): Trace | null {
  for (let i = m.parts.length - 1; i >= 0; i--) {
    const p = m.parts[i]!;
    if (p.type === "data-trace") return (p as { data: Trace }).data;
  }
  return null;
}
