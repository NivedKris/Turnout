"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { withAsOf } from "@/components/shell/nav";
import { ChatPane } from "./ChatPane";
import { useCopilot } from "./CopilotProvider";

/** Right-side glass drawer (⌘J). "View trace" jumps to the terminal with that trace selected. */
export function CopilotDrawer() {
  const { open, setOpen, setSelectedTrace, asOf } = useCopilot();
  const router = useRouter();
  return (
    <>

      <aside
        id="tn-copilot"
        aria-label="Growth analyst copilot"
        aria-hidden={!open}
        className={`tn-glass fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[520px] flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-2 font-mono text-[11px]">
          <span className="bg-fg px-1.5 py-px font-bold tracking-widest text-bg">AI</span>
          <span className="uppercase tracking-[0.18em]">Growth analyst</span>
          <span className="text-fg-3">Groq → Gemini · grounded</span>
          <Link href={withAsOf("/terminal", asOf)} onClick={() => setOpen(false)} className="ml-auto border border-line px-1.5 py-0.5 tracking-wider text-fg-2 hover:border-fg hover:text-fg">
            TERMINAL
          </Link>
          <button onClick={() => setOpen(false)} aria-label="Close copilot" className="px-1 text-fg-3 hover:text-fg">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1">
          {open && (
            <ChatPane
              onTrace={(id) => {
                setSelectedTrace(id);
                setOpen(false);
                router.push(withAsOf("/terminal", asOf));
              }}
            />
          )}
        </div>
      </aside>
    </>
  );
}

/** Header trigger for the copilot drawer. */
export function CopilotButton() {
  const { open, setOpen } = useCopilot();
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="tn-copilot"
      className="flex items-center gap-2 rounded-full bg-fg px-4 py-1.5 text-[13px] font-medium text-bg hover:opacity-90"
    >
      Ask AI <kbd className="font-mono text-[11px] opacity-60">⌘J</kbd>
    </button>
  );
}
