"use client";

import { useEffect } from "react";
import { matchNames } from "@/lib/assistant/names";
import { pathFor, type Destination, type Entities } from "@/lib/assistant/sitemap";
import { applyProposal, rejectProposal } from "./apply";
import { assistant, type ScreenInfo } from "./store";

/**
 * Browser side of the assistant: what the page shows (reported by pages), the
 * current context sent with every request, and the SCREEN tools that run here.
 */

/** Pages call this to report their title and listed items (≤ 40, in display order). */
export function useAssistantScreen(info: Omit<ScreenInfo, "path">) {
  const key = JSON.stringify(info);
  useEffect(() => {
    assistant.set({ screen: { ...info, path: window.location.pathname + window.location.search, items: info.items.slice(0, 40), details: info.details?.slice(0, 3000) } });
    return () => {
      if (assistant.get().screen?.title === info.title) assistant.set({ screen: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function currentAsOf(): string | null {
  return new URLSearchParams(window.location.search).get("asOf");
}

export function contextNow() {
  const s = assistant.get();
  const sc = s.screen;
  return {
    path: window.location.pathname + window.location.search,
    asOf: currentAsOf() ?? undefined,
    title: sc?.title ?? document.title,
    items: sc?.items.map((it, i) => ({ n: i + 1, ...it })) ?? [],
    details: sc?.details,
    pending: assistant.pending().map((p) => ({ id: p.id, kind: p.kind, summary: p.summary })),
  };
}

/** Resolve spoken names to ids before building the path. */
export function resolveDestination(d: Destination, ents: Entities): Destination | { error: string } {
  const out = { ...d };
  const fixCampaign = (q?: string): string | { error: string } | undefined => {
    if (!q) return undefined;
    if (ents.campaigns.some((c) => c.id.toLowerCase() === q.toLowerCase())) return q.toUpperCase();
    const m = matchNames(q, ents.campaigns, (c) => [c.name, c.channel.replace(/_/g, " ")]);
    if (m.length === 1) return m[0]!.item.id;
    if (m.length > 1) return { error: `"${q}" could mean ${m.map((x) => `${x.item.id} ${x.item.name}`).join(" or ")}. Ask which one.` };
    return { error: `No campaign matches "${q}". Campaigns: ${ents.campaigns.map((c) => c.name).join(", ")}.` };
  };
  const c = fixCampaign(d.campaign);
  if (c && typeof c === "object") return c;
  if (c) out.campaign = c;
  const f = fixCampaign(d.filter_campaign);
  if (f && typeof f === "object") return f;
  if (f) out.filter_campaign = f;
  if (d.bet && !ents.bets.some((b) => b.id.toLowerCase() === d.bet!.toLowerCase())) {
    const m = matchNames(d.bet, ents.bets, (b) => [b.title]);
    if (m.length === 1) out.bet = m[0]!.item.id;
    else return { error: m.length ? `"${d.bet}" could mean ${m.map((x) => x.item.title).join(" or ")}.` : `No bet matches "${d.bet}".` };
  }
  return out;
}

type Nav = { push: (p: string) => void; back: () => void; refresh: () => void };

/** Navigate with the travel animation. */
export function go(nav: Nav, path: string, label: string) {
  assistant.set({ travel: { label, at: Date.now() } });
  nav.push(path);
}

/** Runs a SCREEN tool in the browser and returns what to tell the model. */
export async function runScreenTool(name: string, args: Record<string, unknown>, nav: Nav): Promise<Record<string, unknown>> {
  const ents = assistant.get().entities;
  switch (name) {
    case "navigate":
    case "offer_navigation": {
      if (!ents) return { error: "App map not loaded yet." };
      const r = resolveDestination(args as Destination, ents);
      if ("error" in r) return r;
      const p = pathFor(r, ents, currentAsOf());
      if ("error" in p) return p;
      if (name === "navigate") {
        go(nav, p.path, p.label);
        return { status: `Opened ${p.label}. Tell the person in one sentence what is on this screen.`, path: p.path };
      }
      assistant.addCard({ id: `offer_${Date.now()}`, kind: "offer", question: String(args.question ?? `Open ${p.label}?`), path: p.path, label: p.label });
      return { status: `Offered to open ${p.label}. Ask out loud; if they say yes, call navigate with the same destination.` };
    }
    case "get_screen":
      return contextNow();
    case "go_back":
      nav.back();
      return { status: "Went back." };
    case "confirm_change": {
      const r = await applyProposal(String(args.proposal_id ?? ""), nav.refresh);
      return r.ok ? { status: `Done: ${r.message}` } : { error: r.message };
    }
    case "reject_change":
      return rejectProposal(String(args.proposal_id ?? ""));
    case "show_details":
      assistant.addCard({ id: `detail_${Date.now()}`, kind: "detail", title: String(args.title ?? "Details"), markdown: String(args.markdown ?? "") });
      return { status: "Shown on screen. Now speak a two-sentence summary." };
    default:
      return { error: `Unknown screen tool ${name}` };
  }
}

/** Drop-in for server pages: <ReportScreen title=… items=… details=… />. */
export function ReportScreen(props: Omit<ScreenInfo, "path">) {
  useAssistantScreen(props);
  return null;
}
