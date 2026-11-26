/**
 * Monochrome status language. Status is never shown with colour: it uses a dot
 * glyph plus a label.
 *   ● solid  = scale / on track / achieved
 *   ◐ half   = change / at risk
 *   ○ hollow = stop / off track / missed
 *   ◌ dotted = insufficient data / no target / not yet measurable
 */
export type Glyph = "solid" | "half" | "hollow" | "dotted";

export const GLYPH_CHAR: Record<Glyph, string> = { solid: "●", half: "◐", hollow: "○", dotted: "◌" };

const MAP: Record<string, { glyph: Glyph; label: string }> = {
  on_track: { glyph: "solid", label: "On track" },
  achieved: { glyph: "solid", label: "Achieved" },
  under_budget: { glyph: "solid", label: "Under budget" },
  scale: { glyph: "solid", label: "Scale" },
  keep: { glyph: "solid", label: "Keep" },
  at_risk: { glyph: "half", label: "At risk" },
  change: { glyph: "half", label: "Change" },
  watch: { glyph: "half", label: "Watch" },
  off_track: { glyph: "hollow", label: "Off track" },
  missed: { glyph: "hollow", label: "Missed" },
  over_budget: { glyph: "hollow", label: "Over budget" },
  stop: { glyph: "hollow", label: "Stop" },
  insufficient_data: { glyph: "dotted", label: "Insufficient data" },
  no_target: { glyph: "dotted", label: "No target" },
  pending: { glyph: "dotted", label: "Pending" },
};

export function statusGlyph(status: string): { glyph: Glyph; label: string } {
  return MAP[status] ?? { glyph: "dotted", label: status.replaceAll("_", " ") };
}
