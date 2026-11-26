import type { ReactNode } from "react";

/**
 * Page structure primitives. One clear hierarchy everywhere:
 *   PageHeader (what am I looking at) → FilterBar (what slice) → Sections (one idea each).
 */

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-3">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, action, children, className = "" }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 md:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Calm loading placeholder: a block of breathing dots. */
export function Skeleton({ className = "", label }: { className?: string; label?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-surface ${className}`} aria-busy="true" aria-label={label ?? "Loading"}>
      <div className="tn-skeleton absolute inset-0" />
      {label && <span className="absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">{label}</span>}
    </div>
  );
}

export function PageSkeleton({ rows = [["h-28"], ["h-44", "h-44", "h-44"], ["h-72", "h-72"]] }: { rows?: string[][] }) {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-4 md:p-8">
      <Skeleton className="h-16 w-72 border-0 bg-transparent" />
      {rows.map((r, i) => (
        <div key={i} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${r.length}, minmax(0, 1fr))` }}>
          {r.map((h, j) => (
            <Skeleton key={j} className={h} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Standard page container: centred, generous gutters. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 md:p-8">{children}</div>;
}
