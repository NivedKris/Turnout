"use client";

import { useSearchParams } from "next/navigation";
import { AsOfControl } from "@/components/shell/AsOfControl";

export function AsOfFromUrl(props: { min: string; max: string; fallback: string; presets: { day: string; label: string }[] }) {
  const raw = useSearchParams().get("asOf");
  const asOf = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : props.fallback;
  return <AsOfControl asOf={asOf} min={props.min} max={props.max} presets={props.presets} />;
}
