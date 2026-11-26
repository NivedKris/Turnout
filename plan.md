# Growth Center: Build Plan for Claude Code

> **Read this whole file before writing any code.** It is the spec, the architecture and the order of work for the RISA Labs Growth APM assignment (Part 2: "Build Your Growth Center").
> Work through it phase by phase. At the end of each phase, check the acceptance criteria and commit.

---

## 0. Before you start: confirm these with me

Ask me these **in one message**, then continue. Don't guess them.

1. **Track:** Challenge A (Attendee Growth) or Challenge B (Sponsorship Growth)? The architecture below supports both through a config-driven funnel, but the seed data, copy and default dashboard depend on the track.
2. **City:** which Tier 1 Indian city the festival is in, used in copy and research.
3. **Dataset:** where the provided RISA dataset file(s) are (CSV/XLSX/Google Sheet export). Inspect every column before designing the seed script.
4. **LLM provider and key:** Google Gemini (free tier, which the assignment suggests) or Anthropic Claude. Build behind a provider abstraction either way.
5. **MongoDB:** whether I already have an Atlas cluster and connection string, or you should guide me through creating a free M0 cluster.

---

## 1. Context: what we're building and how it's graded

A festival growth team's **command center** with four parts:

| Module | Must do |
|---|---|
| **Measure** | Full funnel, campaign KPIs, target vs. actual, conversion rates, budget, projected outcome |
| **Diagnose** | Winners and losers, bottleneck stage, what's driving changes over time |
| **Decide** | Prioritize, reallocate budget, scale/change/stop recommendations based on thresholds |
| **Manage** | CRUD for campaigns, tasks, owners, deadlines and action items. **Every change persists and updates analytics.** |
| **AI Copilot** | Grounded in live DB data, does calculations correctly, diagnoses, recommends, creates tasks **after user confirmation**, handles follow-ups, says "the data can't answer that" when it can't |

The reviewers will change data and ask the chatbot unfamiliar questions. **Never hardcode answers.** The dashboard and the copilot must always compute from the current DB state.

Grading: 20% dashboard and management, 20% chatbot, 5% communication (README). The rest is the strategy deck. They don't reward a polished UI on its own; correctness and the insight-to-action loop matter most.

---

## 2. Phase 0: research (do this first, write it to `docs/research.md`)

Use web search. Cite every source with a URL. Label every number as **Sourced** or **Assumption**.

### 2a. Technical research (check current versions, don't rely on memory)
- Latest stable **Next.js** (App Router) and its current Vercel deployment requirements.
- **MongoDB Node.js driver** and/or **Mongoose**: current versions, and the recommended **connection caching pattern for Vercel serverless functions** (avoiding connection storms). Also the current **Vercel ↔ MongoDB Atlas integration** and Atlas network access settings for Vercel.
- **Vercel AI SDK** (`ai` package): current API for streaming chat, **tool calling**, multi-step tool use, and the `useChat` hook. Check the Google (`@ai-sdk/google`) and Anthropic (`@ai-sdk/anthropic`) provider packages and the **current model IDs** (e.g. the current Gemini Flash/Pro and Claude Sonnet IDs).
- Free-tier limits: Atlas M0, Vercel Hobby function timeout, Gemini free-tier rate limits. Design around them (e.g. set `maxDuration` on the chat route).
- **Dot-matrix fonts:** licences and availability. Candidates: **Doto** (Google Fonts), **DotGothic16** (Google Fonts), **Geist / Geist Mono** (Vercel, OFL). Don't use Nothing's proprietary NDot font unless its licence allows it.
- Libraries for safe math evaluation (e.g. `mathjs`) and validation (`zod`).

### 2b. Domain research (feeds the README and the seed assumptions)
- Attendance and footfall of major Indian college fests (e.g. Mood Indigo at IIT Bombay, Saarang at IIT Madras, Rendezvous at IIT Delhi, Techfest, Oasis at BITS Pilani), plus the college student population of the chosen city.
- Typical sponsorship tiers and deal sizes for Indian college fests, the sponsor categories (D2C, edtech, fintech, beverages, telecom, gaming) and their motivations.
- Benchmark conversion rates: social ad CTR in India, event registration-to-attendance ("show-up") rates for free vs. paid events, B2B cold outreach reply rates, proposal-to-close rates.
- Typical CAC / cost per registration for Instagram and Meta ads in India.

Output: `docs/research.md` with a table for each topic (Metric | Value | Source | Sourced/Assumption | Notes).

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server Components for reads, Route Handlers / Server Actions for writes |
| Hosting | **Vercel** | Node.js runtime (not Edge) for any route that touches MongoDB |
| DB | **MongoDB Atlas** (M0 free) | Native driver or Mongoose; cached client in `lib/db.ts` |
| Validation | **Zod** | Shared schemas for API input, forms and LLM tool arguments |
| Styling | **Tailwind CSS** + CSS variables for design tokens | |
| UI primitives | shadcn/ui (Radix), restyled to the design system | Accessibility for dialogs, menus and tables |
| Charts | **Custom SVG dot-matrix components** (optionally built on `visx`/`d3-scale`) | Charts must look like dot matrices, see §9 |
| Motion | `motion` (Framer Motion) | Respect `prefers-reduced-motion` |
| Data fetching | Server Components + `revalidatePath`/`revalidateTag` after mutations; SWR on client widgets | Analytics must refresh after edits |
| AI | **Vercel AI SDK** with a provider abstraction (Gemini or Claude) | Tool calling, streaming |
| Math | `mathjs` (sandboxed evaluate) | The LLM never does arithmetic in its head |
| Tests | **Vitest** (analytics engine, rules) + a scripted **copilot eval** | |

---

## 4. Architecture

```
┌──────────────────────────── Browser ─────────────────────────────┐
│  Dashboard · Funnel · Campaigns · Tasks · Budget · Planner       │
│  Copilot panel (useChat, streaming) ── confirmation cards        │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ Server Actions / REST          │ POST /api/chat (stream)
┌───────────────▼───────────────────────────────▼──────────────────┐
│                     Next.js on Vercel (Node runtime)              │
│  ┌──────────────┐  ┌────────────────────┐  ┌───────────────────┐  │
│  │ Domain API   │  │ Analytics Engine   │  │ Copilot Orchestr. │  │
│  │ CRUD + Zod   │─▶│ pure TS functions  │◀─│ system prompt +   │  │
│  │ activity log │  │ funnel, KPIs,      │  │ tools (read-only  │  │
│  └──────┬───────┘  │ projections, rules │  │ + propose_*)      │  │
│         │          └─────────┬──────────┘  └────────┬──────────┘  │
│         │                    │                      │ LLM API      │
└─────────┼────────────────────┼──────────────────────┼─────────────┘
          ▼                    ▼                      ▼
   ┌───────────────────── MongoDB Atlas ─────────┐   Gemini / Claude
   │ campaigns · metrics_daily · tasks · budgets │
   │ targets · rules · activity · chat_sessions  │
   │ baseline_snapshot (original dataset)        │
   └─────────────────────────────────────────────┘
```

**Key principle:** there is **one** analytics engine (`lib/analytics/*`). The dashboard and the copilot tools both call it. So the numbers the chatbot quotes always match what's on screen.

---

## 5. Data model (MongoDB collections)

Design the funnel as **config, not code**, so both tracks share one engine.

### `settings` (single doc)
```ts
{
  track: "attendee" | "sponsorship",
  city: string,
  festivalName: string,
  festivalDate: Date,
  campaignStart: Date,
  capacity?: number,                 // venue cap (track A)
  totalBudget: number,
  currency: "INR",
  funnelStages: [                    // ordered
    { key: "reach", label: "Reach" },
    { key: "registrations", label: "Registrations" },
    { key: "attendees", label: "Attendees" }
  ],
  targets: { base: number, stretch: number, metricKey: string } // e.g. attendees or cashCollected
}
```
Default stages:
- **Track A:** `reach → clicks → registrations → confirmed (ticket/RSVP) → attendees (check-in)`
- **Track B:** `prospects → contacted → conversations → proposals → signed → invoiced → cash_collected`

### `campaigns`
```ts
{
  _id, name, channel,               // A: instagram_ads, college_ambassadors, influencers, whatsapp, partnerships…
                                    // B: segment/sector, outreach channel
  audience / sponsorSegment,
  owner, status: "planned"|"active"|"paused"|"stopped"|"completed",
  startDate, endDate,
  budgetAllocated, budgetSpent,
  hypothesis: string,               // why we think it works
  priorityScore: { reach, impact, confidence, effort, rice: number },
  thresholds: {                     // drive scale/change/stop
    metric: string,                 // e.g. "cost_per_registration", "reply_rate"
    scaleIf: number, stopIf: number, direction: "lower_is_better"|"higher_is_better",
    minSampleSize: number           // don't judge before N events
  },
  tags: string[], source: "dataset"|"simulated"|"user", createdAt, updatedAt
}
```

### `metrics_daily` (time series, one doc per campaign per day)
```ts
{ campaignId, date, stages: { reach: 12000, registrations: 340, ... }, spend: 4500, source }
```
Index `{campaignId: 1, date: 1}` as unique.

For **Track B**, also add **`deals`** (one doc per sponsor):
```ts
{ sponsorName, sector, campaignId, stage, dealValue, probability, expectedCloseDate,
  signedAt?, invoicedAt?, cashCollected, collectedAt?, contact, owner, notes, lostReason? }
```
Deal-level data is the source of truth for funnel counts in Track B.

### `tasks`
```ts
{ title, description, campaignId?, owner, dueDate, status: "todo"|"doing"|"done"|"blocked",
  priority: "P0"|"P1"|"P2", createdBy: "user"|"copilot", sourceInsight?: string, createdAt, updatedAt }
```

### `activity` (audit log, append-only)
`{ entity, entityId, action, before, after, actor: "user"|"copilot", at }`. It powers "what changed?" questions and the timeline.

### `baseline_snapshot`
The **untouched original dataset** as imported, plus a `POST /api/admin/reset` that restores the live collections from it. The reviewers need the original data available to test the chatbot.

### `chat_sessions` (optional)
Stores conversation history so follow-ups work across reloads.

---

## 6. Analytics engine (`lib/analytics/`)

Pure, typed, unit-tested functions. **No DB calls inside**, so they're easy to test. A thin loader fetches the data and passes it in.

- `funnel(data, filters)` → counts per stage, stage-to-stage conversion %, overall conversion, drop-off.
- `campaignKpis(campaign, metrics)` → spend, cost per stage (CPR, CPA / cost per ₹ raised), conversion rates, ROI, pacing vs. plan.
- `targetVsActual(settings, data, asOf)` → actual, % of target, required daily run-rate vs. current run-rate, days remaining.
- `projection(data, asOf, method)` → projected final outcome as **base** (current trailing 7-day run-rate) and **stretch** (best-quartile campaign rates applied to remaining budget), with assumptions listed. Track A caps at venue capacity. Track B uses a weighted pipeline: Σ(dealValue × stage probability × collection rate).
- `bottleneck(funnel, benchmarks)` → the stage whose conversion is furthest below benchmark/target, with the gap explained.
- `trend(metrics, window)` → week-over-week change per KPI, plus the top contributing campaigns to each change.
- `evaluateRules(campaign, kpis)` → `scale | keep | change | stop | insufficient_data`, with a reason string. Respect `minSampleSize`.
- `reallocation(campaigns, budgetLeft)` → suggested budget shifts from "stop/change" to "scale" campaigns, ranked by marginal cost per outcome.
- `scenario(changes)` → "what if we move ₹X from A to B" or "what if show-up rate drops to 40%". Returns a new projection.
- `dataCoverage()` → which fields exist, the date range, missing values and simulated vs. sourced share. The copilot uses it to know what it **can't** answer.

Every function returns `{ value, formula, inputs, assumptions[] }` so the UI and the copilot can show their working.

**Tests:** cover every function with hand-calculated fixtures in Vitest, including edge cases (zero spend, zero denominator, a campaign with no data, a date outside the range).

---

## 7. API surface

| Route | Purpose |
|---|---|
| `GET /api/overview` | KPIs, target vs. actual, projection |
| `GET /api/funnel?campaign=&from=&to=` | Funnel |
| `GET/POST/PATCH/DELETE /api/campaigns` | Campaign CRUD |
| `POST /api/campaigns/:id/metrics` | Log daily metrics (manual entry and CSV upload) |
| `GET/POST/PATCH/DELETE /api/tasks` | Task CRUD |
| `GET/POST/PATCH /api/deals` | (Track B) Deal CRUD and stage moves |
| `GET /api/insights` | Rule evaluations, bottleneck, reallocation suggestions |
| `POST /api/scenario` | What-if planner |
| `GET /api/activity` | Change log |
| `POST /api/chat` | Copilot (streaming, tool calls) |
| `POST /api/admin/seed`, `/reset` | Seed from dataset / restore baseline (protect with `ADMIN_TOKEN`) |

Every mutation: Zod-validate the input → write → append to `activity` → `revalidateTag('analytics')`.

---

## 8. AI Copilot ("Growth Analyst")

### 8a. Grounding model: tools, not context stuffing
The LLM gets **no raw data in the prompt** apart from a short live summary (date, track, target, days left). It must call tools for everything else.

**Read tools** (call the analytics engine, return JSON with `formula`, `inputs`, `assumptions`):
- `get_overview()`
- `get_funnel({ campaignIds?, from?, to? })`
- `list_campaigns({ status?, channel?, sortBy?, limit? })`
- `get_campaign({ id | name })` (with fuzzy name matching; returns candidates if ambiguous)
- `compare_campaigns({ ids, metrics })`
- `get_bottleneck()`
- `get_trends({ metric, window })`
- `get_rule_evaluations()`
- `suggest_reallocation({ budgetToMove? })`
- `run_scenario({ changes })`
- `list_tasks({ status?, owner?, overdue?, campaignId? })`
- `get_activity({ since? })` ("what changed since yesterday?")
- `get_data_coverage()`
- `calculate({ expression, variables })` (mathjs sandbox; **all arithmetic goes through this or the engine**)

**Action tools (propose only):**
- `propose_task({ title, owner, dueDate, priority, campaignId, rationale })`
- `propose_campaign_update({ id, patch, rationale })` (e.g. pause, change budget)

Proposal tools **don't write to the DB**. They return a draft, and the UI renders a **confirmation card** (Confirm / Edit / Discard). Only the user's click calls the real API, which logs `actor: "copilot"` and `createdBy: "copilot"`. This is the "insight → action" workflow.

### 8b. System prompt rules (write to `lib/copilot/system-prompt.ts`)
- You are the festival's growth analyst. Answer **only** from tool results for questions about this campaign. General marketing knowledge may be offered only if it's labelled "General knowledge, not from your data".
- Always call a tool before stating any number. Never do arithmetic mentally: use `calculate` or the engine.
- Structure analytical answers as: **Answer → Evidence (numbers + source tool) → Assumptions → Missing data / confidence → Suggested action**.
- If the data can't support an answer (e.g. a field that doesn't exist, a date range with no data, causal "why" with no evidence), say so plainly, say what data would be needed, and offer the closest answer you *can* support.
- Distinguish correlation from causation.
- Resolve follow-ups ("what about the second one?", "and last week?") using conversation history.
- Never claim an action was done. Propose it and wait for confirmation.
- Use rupees with Indian digit grouping (₹1,25,000) and the user's timezone (IST).

### 8c. Implementation
- `streamText` with `tools`, multi-step enabled (check the current AI SDK API in Phase 0), and `maxDuration` set on the route.
- Show tool calls in the UI as small collapsible "Checked: funnel, campaigns" chips, so users can see the grounding.
- Suggested prompt chips: "Where's our biggest bottleneck?", "Which campaign should we cut?", "Are we on track for the stretch target?", "Create a task to fix the worst campaign".
- Rate-limit per IP; handle LLM errors with a friendly message.

### 8d. Demo workflow (must work end to end, and goes in the README)
1. "Are we on track?" → projection vs. target with run-rate gap.
2. "Why?" (follow-up) → bottleneck stage + the underperforming campaigns.
3. "What should we do?" → reallocation + a scale/stop recommendation tied to thresholds.
4. "Create a task for that" → confirmation card → confirm → the task appears in Tasks and the activity log.
5. User edits a campaign's metrics in the UI → asks again → the answer changes accordingly.
6. "What was our Instagram CTR in 2023?" (or anything outside the data) → honest "the data doesn't contain this" answer.

### 8e. Copilot eval (`scripts/eval-copilot.ts`)
At least 25 test questions, each with an expected numeric answer (computed by the engine) or an expected behaviour (refusal, clarification, proposal). Categories: lookup, calculation, comparison, diagnosis, recommendation, follow-up, action, unanswerable, ambiguous, after a data change. Run it, record the pass rate in the README, and fix failures.

---

## 9. Design system: "Apple × dot matrix, black and white, futuristic"

### Principles
- **Apple-like restraint:** big confident type, generous whitespace, one idea per section, precise alignment, soft large radii, smooth spring motion, no clutter.
- **Strictly monochrome:** black, white and greys. No brand colours. Status is shown with **dot glyphs, fill patterns and labels**, not colour:
  - ● solid = scale / on track · ◐ half = change / at risk · ○ hollow = stop / off track · ◌ dotted = insufficient data
- **Dot matrix as the signature motif,** used deliberately rather than everywhere.

### Tokens (`app/globals.css`)
```css
--bg: #000; --surface: #0A0A0A; --surface-2: #141414; --line: #262626;
--text: #FFFFFF; --text-2: #A3A3A3; --text-3: #6B6B6B;
--radius-lg: 24px; --radius-md: 16px;
--dot-size: 2px; --dot-gap: 6px;
```
Dark mode is the default, with a light-mode toggle (full inversion). Both must meet WCAG AA contrast.

### Typography
- **Display / hero numbers:** dot-matrix font (Doto or DotGothic16; confirm in research), **only at ≥ 28px**.
- **UI / body:** Geist Sans or Inter, tight tracking on headings like SF Pro.
- **Data / tables / numerals:** Geist Mono with `font-variant-numeric: tabular-nums`.
- Never use the dot font for body text, tables or small labels (readability).

### Signature components
- **Dot-grid background:** subtle `radial-gradient` dot field, fading at the edges (mask-image).
- **Matrix KPI tiles:** large dot-matrix number, small mono label, delta in mono, ghost sparkline drawn as dots.
- **Dot funnel:** each stage is a row of dots whose lit count is proportional to volume; conversion % between stages.
- **Dot bar / dot column charts:** bars made of stacked dots (custom SVG). Hover lights up a column and shows a glass tooltip.
- **LED progress bar:** target vs. actual as a dot strip, with base and stretch markers.
- **Glass panels:** `backdrop-filter: blur(20px)` on `rgba(20,20,20,0.6)`, 1px `--line` border, for the copilot drawer and modals.
- **Copilot:** right-side drawer (⌘K / Ctrl+K to open), dot-matrix "thinking" animation (a pulsing 5×5 dot grid), tool-call chips, confirmation cards.
- **Micro-interactions:** dots "boot up" on first load (staggered fade), number tickers on change, subtle scanline shimmer on hero. All disabled under `prefers-reduced-motion`.

### Layout
- Left rail navigation with icons + labels: Overview · Funnel · Campaigns · Tasks · (Deals) · Planner · Activity.
- Overview: hero target-vs-actual strip → 4 KPI tiles → funnel → campaign leaderboard with rule glyphs → "Needs attention" insights with one-click "Create task".
- Responsive down to tablet; mobile is usable but secondary.

Before building pages, create `/design` with a page showing every token and component. Use it to keep things consistent.

---

## 10. Repo structure

```
/app
  /(dashboard)/page.tsx            # Overview
  /(dashboard)/funnel/page.tsx
  /(dashboard)/campaigns/[id]/page.tsx
  /(dashboard)/tasks/page.tsx
  /(dashboard)/deals/page.tsx      # track B
  /(dashboard)/planner/page.tsx    # scenarios + reallocation
  /(dashboard)/activity/page.tsx
  /design/page.tsx                 # component gallery
  /api/...                         # routes from §7
/components/ui/*                   # restyled primitives
/components/matrix/*               # DotGrid, MatrixNumber, DotFunnel, DotBars, LedProgress
/components/copilot/*              # Drawer, Message, ToolChip, ConfirmCard
/lib/db.ts                         # cached Mongo client
/lib/models/*                      # zod schemas + types
/lib/analytics/*                   # engine (pure)
/lib/rules/*
/lib/copilot/{tools.ts,system-prompt.ts,provider.ts}
/scripts/{seed.ts,eval-copilot.ts,simulate.ts}
/data/original/*                   # untouched RISA dataset
/docs/{research.md,assumptions.md,calculations.md,eval-results.md}
README.md
```

---

## 11. Build phases and acceptance criteria

| # | Phase | Done when |
|---|---|---|
| 0 | Research + confirm decisions | `docs/research.md` exists with sources; §0 answers recorded in `docs/decisions.md` |
| 1 | Scaffold + DB | Next.js app deploys to Vercel; `lib/db.ts` caches the connection; env vars documented in `.env.example` |
| 2 | Seed + baseline | `scripts/seed.ts` imports the dataset **without altering the original file**, maps it to collections, marks `source`, writes `baseline_snapshot`; optional `simulate.ts` adds clearly labelled simulated campaigns/days; reset endpoint works |
| 3 | Analytics engine | All §6 functions implemented, Vitest suite passes, results match hand calculations in `docs/calculations.md` |
| 4 | Design system | `/design` gallery shows all tokens and matrix components in dark and light |
| 5 | Dashboard (Measure + Diagnose) | Overview, Funnel and Campaign detail render real data; filters work |
| 6 | Management | CRUD for campaigns, metrics entry/CSV upload, tasks (table + kanban), deals (track B); edits persist after reload and **immediately** update analytics; activity log records every change |
| 7 | Decide | Rule glyphs on campaigns, "Needs attention" panel, reallocation suggestions, scenario planner; "Create task from insight" button |
| 8 | Copilot | All tools, confirmation cards, follow-ups, the honest-uncertainty path; the §8d demo passes |
| 9 | Eval + hardening | `eval-copilot.ts` ≥ 90% pass; error/empty/loading states everywhere; Lighthouse accessibility ≥ 90 |
| 10 | Deploy + README | Production URL works with a fresh browser; README complete (§13) |

Commit at the end of every phase with a clear message.

---

## 12. Engineering rules

- TypeScript strict mode; no `any` in domain code.
- Secrets only in env vars (`MONGODB_URI`, `GOOGLE_GENERATIVE_AI_API_KEY` or `ANTHROPIC_API_KEY`, `ADMIN_TOKEN`). Never expose them to the client.
- Every number on screen comes from the analytics engine. No hardcoded figures in components.
- Show "Simulated" badges on simulated data, everywhere it appears.
- Handle empty states (a new campaign with no metrics) gracefully in both the UI and the copilot.
- Dates are stored in UTC and displayed in IST. Currency is INR with Indian grouping.
- Keep the copilot provider swappable via `lib/copilot/provider.ts`.
- Auth: a simple shared passcode gate (env `APP_PASSCODE`) is enough for the demo. Keep the reviewer path frictionless and put the passcode in the submission.

---

## 13. README (graded: write it properly)

Sections:
1. What it is + live link + passcode + 60-second tour
2. The demo workflow (§8d) with screenshots/GIF
3. Architecture diagram + stack, with the **tools and plans used** (free tiers, etc.)
4. Data: original dataset, how it's mapped, what's **sourced vs. simulated vs. assumed**
5. Calculations: every formula with a worked example (link `docs/calculations.md`)
6. Research + sources (link `docs/research.md`)
7. Prioritization framework used for campaigns (RICE fields in the model)
8. Copilot design: tools, grounding, confirmation flow, uncertainty handling, eval results
9. Setup: local dev, env vars, seed, reset, deploy to Vercel, Atlas network config
10. Testing: unit tests + copilot eval, and how to run them
11. Known limitations + what I'd do next
12. What was reused/modified (libraries, templates) and what was verified by hand

---

## 14. Out of scope
- Real ad-platform/CRM integrations (simulate them instead; optionally leave a CSV import as the integration point).
- Multi-tenant auth and roles.
- Native mobile app.
---

## 15. Addendum (2026-11-26): copilot trace graph + terminal mode

Added on the user's request. Decisions are recorded in `docs/decisions.md`.

### 15a. Every copilot answer carries a trace
The orchestrator records a structured **trace** for each assistant turn and stores it with the message in `chat_sessions`:

```ts
type TraceNode =
  | { id; kind: "question"; text }
  | { id; kind: "tool"; name; args; ms; ok }                       // get_funnel, calculate…
  | { id; kind: "engine"; fn; formula; inputs }                   // lib/analytics function that ran
  | { id; kind: "source"; collection; docIds; count; origin: "dataset"|"simulated"|"user"; range? }
  | { id; kind: "rule"; campaignId; metric; value; scaleIf; stopIf; verdict }
  | { id; kind: "assumption"; text; label: "Sourced"|"Assumption"; url? }
  | { id; kind: "claim"; text; value? }                           // each number in the final answer
  | { id; kind: "proposal"; action; status: "pending"|"confirmed"|"discarded" };
type TraceEdge = { from; to; rel: "called"|"computed_by"|"read"|"evaluated"|"assumes"|"supports"|"proposes" };
```
- Built **server-side from real tool executions**, never from LLM self-reporting. Every analytics result already returns `{formula, inputs, assumptions}`, and loaders return the doc IDs they read.
- Each `claim` node links back to the tool/engine node whose output contains that number. A claim the LLM produces with no supporting edge is flagged **"unsupported"** in the UI, and the eval counts it as a failure.

### 15b. Trace graph view (`components/trace/*`, `@xyflow/react` + dagre layout)
- Left to right: Question → Tools → Engine → Sources/Rules/Assumptions → Claims → Answer.
- Monochrome node glyphs by kind. Edges are dotted lines with an animated "data flowing" dash on hover. Clicking a node opens its JSON (formula, inputs, doc IDs) in an inspector.
- Opened from any assistant message ("View trace") and as a full page at `/trace/[messageId]`, shareable with reviewers.

### 15c. Terminal mode (Bloomberg-style, monochrome)
A dense alternative layout for the copilot: `/terminal` and a toggle in the drawer.
- **Command line** with mnemonics plus `<GO>`: `OVR` overview, `FUNL` funnel, `CMP <name>` campaign, `BTNK` bottleneck, `RULE` rule evals, `RALC` reallocation, `WHAT <change>` scenario, `ACT` activity, `TASK` tasks. Free text goes to the copilot.
- **Panes:** chat (left), live trace graph (centre), inspector and sources list (right), and a bottom **ticker tape** of live KPIs plus the latest `activity` entries.
- Mono everywhere (Geist Mono), Doto only for the big pane headline number. Hairline grid, F-key hints, keyboard-first (⌘K, ↑/↓ history, Esc).
- The same tools, engine and trace back it. There is no separate logic.

### 15d. UI libraries
- **React Bits** (MIT + Commons Clause) components are copied in via `npx shadcn@latest add https://reactbits.dev/r/<Name>-TS-TW` and restyled to monochrome. Shortlist is in `docs/research.md` §1. No more than 2–3 effects per page, all disabled under `prefers-reduced-motion`.
- **Display font is Doto** (decided).

### 15e. Phase changes
- Phase 4 (design) adds trace node components and the terminal shell to `/design`.
- Phase 8 (copilot) adds the trace recorder, graph view and terminal mode. The §8d demo must be runnable from `/terminal` too.
- Phase 9 eval adds checks that every numeric claim has a supporting trace edge.
