"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KPIS, kpiByMnemonic } from "@/lib/ui/kpis";
import { NAV, withAsOf } from "./nav";

type Hit = { cmd: string; label: string; href: string };

const COMMANDS: Hit[] = [
  ...NAV.map((n) => ({ cmd: n.code, label: n.label, href: n.href })),
  ...Object.values(KPIS).map((k) => ({ cmd: k.mnemonic, label: `${k.label} drill-down`, href: `/kpi/${k.key}` })),
  { cmd: "DES", label: "Design system", href: "/design" },
];

/**
 * Bloomberg-style command line: type a mnemonic and press <GO> (Enter).
 * ⌘K / Ctrl+K focuses it. Unknown input is offered to the copilot.
 */
export function CommandBar() {
  const router = useRouter();
  const params = useSearchParams();
  const asOf = params.get("asOf");
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        setOpen(true);
      }
      if (e.key === "/" && document.activeElement === document.body) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim().toUpperCase().replace(/\s*<?GO>?$/, "");
  const hits = term ? COMMANDS.filter((c) => c.cmd.startsWith(term) || c.label.toUpperCase().includes(term)).slice(0, 7) : COMMANDS.slice(0, 7);

  const run = (h?: Hit) => {
    const k = kpiByMnemonic(term);
    const target = h ?? (k ? { cmd: k.mnemonic, label: k.label, href: `/kpi/${k.key}` } : hits[0]);
    if (target && (h || term === target.cmd || hits.length === 1 || k)) {
      router.push(withAsOf(target.href, asOf));
    } else if (q.trim()) {
      // Free text goes to the copilot.
      window.dispatchEvent(new CustomEvent("turnout:ask", { detail: q.trim() }));
    }
    setQ("");
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex items-center border border-line bg-bg font-mono text-[12px] focus-within:border-fg">
        <span className="px-2 text-fg-3" aria-hidden>
          ›
        </span>
        <input
          ref={ref}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setSel(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(hits.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(open && q.trim() && hits[sel] && !kpiByMnemonic(term) ? hits[sel] : undefined);
            } else if (e.key === "Escape") {
              setOpen(false);
              ref.current?.blur();
            }
          }}
          placeholder="REG <GO> · FUNL · CMP · or ask the copilot…"
          aria-label="Command line"
          aria-expanded={open}
          aria-controls="tn-cmd-list"
          role="combobox"
          className="min-w-0 flex-1 bg-transparent py-1.5 uppercase text-fg outline-none placeholder:normal-case placeholder:text-fg-3"
        />
        <kbd className="mr-1 hidden border border-line px-1 text-[10px] text-fg-3 sm:block">⌘K</kbd>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => run()} className="bg-fg px-2 py-1.5 text-[11px] font-bold tracking-widest text-bg">
          GO
        </button>
      </div>
      {open && (
        <ul id="tn-cmd-list" role="listbox" className="tn-glass absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto font-mono text-[12px]">
          {hits.map((h, i) => (
            <li key={h.cmd} role="option" aria-selected={i === sel}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(h)}
                className={`flex w-full items-center gap-3 px-3 py-1.5 text-left ${i === sel ? "bg-fg text-bg" : "text-fg-2 hover:text-fg"}`}
              >
                <span className="w-12 font-bold tracking-wider">{h.cmd}</span>
                <span className="truncate">{h.label}</span>
                <span className="ml-auto text-[10px] opacity-70">&lt;GO&gt;</span>
              </button>
            </li>
          ))}
          {q.trim() && !kpiByMnemonic(term) && (
            <li className="border-t border-line px-3 py-1.5 text-[11px] text-fg-3">↵ to ask the copilot: “{q.trim()}”</li>
          )}
        </ul>
      )}
    </div>
  );
}
