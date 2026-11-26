"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { withAsOf } from "@/components/shell/nav";
import { ChatPane } from "./ChatPane";
import { useCopilot } from "./CopilotProvider";

/** Right-side glass drawer (⌘J). "View trace" jumps to the terminal with that trace selected. */
export function CopilotDrawer() {
  const { open, setOpen, setSelectedTrace, asOf } = useCopilot();
  const router = useRouter();
  const onTerminal = usePathname().startsWith("/terminal");
  return (
    <>
      {!onTerminal && <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="tn-copilot"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 border border-fg bg-bg px-3 py-2 font-mono text-[11px] font-bold tracking-widest shadow-[4px_4px_0_0_var(--text)] hover:bg-fg hover:text-bg"
      >
        <span aria-hidden>◉</span> COPILOT <kbd className="font-normal opacity-60">⌘J</kbd>
      </button>}
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
