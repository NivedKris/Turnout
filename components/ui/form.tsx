"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Monochrome form primitives with labels and error text wired for screen readers. */

export function Field({ label, htmlFor, error, hint, children, className = "" }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-3">
        {label}
      </label>
      {children}
      {hint && !error && <p className="font-mono text-[10px] text-fg-3">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-err`} role="alert" className="font-mono text-[11px] text-fg underline decoration-dotted">
          ✕ {error}
        </p>
      )}
    </div>
  );
}

const base = "w-full border border-line bg-bg px-2 py-1.5 font-mono text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-fg";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${base} ${props.className ?? ""}`} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${base} ${props.className ?? ""}`} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${base} min-h-20 ${props.className ?? ""}`} />;
}

export function Button({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v =
    variant === "primary"
      ? "bg-fg text-bg hover:opacity-90"
      : variant === "danger"
        ? "border border-fg text-fg hover:bg-fg hover:text-bg"
        : "border border-line text-fg-2 hover:border-fg hover:text-fg";
  return (
    <button
      {...props}
      className={`px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`}
    />
  );
}

/** Maps zod issue paths to field errors. */
export function issuesToErrors(issues?: { path: string; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues ?? []) out[i.path || "_"] ??= i.message;
  return out;
}

export function FormMessage({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={`border px-2 py-1 font-mono text-[11px] ${error ? "border-fg text-fg" : "border-line text-fg-2"}`}>
      {error ? `✕ ${error}` : `✓ ${ok}`}
    </p>
  );
}

/**
 * Date field that always reads as "2 Apr 2025" (Indian day-month order) whatever the
 * browser locale, while keeping the native date picker on click.
 */
export function DateField({ value, onChange, disabled, id, min, max, required, className = "", "aria-label": label }: { value: string; onChange: (v: string) => void; disabled?: boolean; id?: string; min?: string; max?: string; required?: boolean; className?: string; "aria-label"?: string }) {
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
    : "Pick a date";
  return (
    <span className={`${base} relative flex cursor-pointer items-center justify-between gap-2 ${disabled ? "opacity-60" : ""} ${className}`}>
      <span className="truncate">{shown}</span>
      <span aria-hidden className="text-fg-3">▾</span>
      <input
        type="date"
        id={id}
        aria-label={label}
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}
