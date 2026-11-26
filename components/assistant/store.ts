"use client";

import { useSyncExternalStore } from "react";
import type { Entities } from "@/lib/assistant/sitemap";

/**
 * Tiny external store for the in-app assistant: live status and level, captions,
 * cards above the voice bar, proposals waiting for a yes, what the page shows,
 * and the travel animation. Shared by voice, chat and pages.
 */
export type LiveStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

export type Proposal = {
  id: string;
  kind: "task" | "campaign_update" | "decision";
  summary: string;
  payload: Record<string, unknown>;
  state: "pending" | "confirmed" | "rejected" | "failed";
  result?: string;
};

export type Card =
  | { id: string; kind: "detail"; title: string; markdown: string }
  | { id: string; kind: "offer"; question: string; path: string; label: string }
  | { id: string; kind: "proposal"; proposalId: string }
  | { id: string; kind: "note"; text: string };

export type ScreenInfo = { path: string; title: string; items: { id: string; label: string; kind: string }[]; details?: string };

type State = {
  voiceOn: boolean;
  status: LiveStatus;
  level: number;
  heard: string;
  caption: string;
  error: string | null;
  cards: Card[];
  proposals: Record<string, Proposal>;
  screen: ScreenInfo | null;
  travel: { label: string; at: number } | null;
  entities: Entities | null;
};

let state: State = { voiceOn: false, status: "idle", level: 0, heard: "", caption: "", error: null, cards: [], proposals: {}, screen: null, travel: null, entities: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const assistant = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    emit();
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  addCard(c: Card) {
    state = { ...state, cards: [...state.cards.filter((x) => x.id !== c.id), c].slice(-4) };
    emit();
  },
  dropCard(id: string) {
    state = { ...state, cards: state.cards.filter((c) => c.id !== id) };
    emit();
  },
  propose(p: Omit<Proposal, "state">) {
    state = { ...state, proposals: { ...state.proposals, [p.id]: { ...p, state: "pending" } } };
    emit();
    assistant.addCard({ id: `card_${p.id}`, kind: "proposal", proposalId: p.id });
  },
  settle(id: string, s: Proposal["state"], result?: string) {
    const p = state.proposals[id];
    if (!p) return;
    state = { ...state, proposals: { ...state.proposals, [id]: { ...p, state: s, result } } };
    emit();
  },
  pending(): Proposal[] {
    return Object.values(state.proposals).filter((p) => p.state === "pending");
  },
};

export function useAssistant<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(assistant.subscribe, () => sel(state), () => sel(state));
}
