# TURNOUT: attendee growth command center

**Turnout** is the growth center for *CampusFest 2025*, a fictional two-day college festival (12–13 Apr 2025) that this submission frames as a **Bengaluru** fest. It's Part 2 of the RISA Growth APM assignment, **Challenge A: Attendee Growth**. The team uses it to **measure** the funnel, **diagnose** what's driving it, **decide** what to scale, change or stop, **act** on that through campaigns and tasks, and **ask** a grounded AI analyst whose execution graph shows exactly how each answer was produced.

- **Live app:** _add the Vercel URL after deploy_ · **Passcode:** _set `APP_PASSCODE` and share it in the submission_
- **Stack:** Next.js 16 · MongoDB Atlas (M0) · Vercel AI SDK 7 · Groq → Gemini · React Flow · Doto / Geist

---

## 1. 60-second tour

1. **Overview (OVR):** the hero line states the headline in words, e.g. *"Registrations at risk: 2,887 projected vs 3,200 goal"*.
   - Eight **KPI systems** (REG, VIS, IDN, SPD, CPR, SHW, CTR, CNF), each with an odometer value, an LED progress strip against goal and a dot sparkline.
   - The funnel, a **Needs attention** list (each item has **+ TASK**), and a campaign leaderboard with rule glyphs.
2. **Click any KPI** to open a Bloomberg-style drill-down (`/kpi/reg`). It has:
   - a dot-matrix chart with crosshair, ranges, cumulative mode, goal line, annotations and a **base/stretch forecast cone**;
   - campaign overlays, a readout, the formula and inputs, the sources read, and the assumptions;
   - a by-campaign breakdown.
3. **Time machine:** the as-of slider in the top bar replays any day from 15 Jan to 20 Apr 2025. Every view and the copilot compute "as of the end of that IST day".
4. **Command line:** type `REG <GO>`, `FUNL`, `CMP` or `RALC`, or ask a free-text question (⌘K).
5. **Copilot (⌘J) and the TERM terminal:** ask *"Are we on track?"*. The terminal shows the agent's execution graph building live:
   - each model call (and any fallback between providers);
   - each tool call, analytics function, data source, rule and assumption;
   - every number in the answer, marked grounded or **UNSUPPORTED**.

## 2. The demo workflow (§8d)

Set the as-of to **31 Mar 2025** ("Decision point"), then ask:

| # | Ask | What happens |
|---|---|---|
| 1 | *Are we on track?* | `get_overview`: registrations **at risk** (2,337 now, 2,887 projected vs 3,200), visitors **off track** (1,837 base vs 2,200), spend under budget |
| 2 | *Why?* (follow-up) | `get_bottleneck` + `get_funnel`: identified → registered is **70.4% vs the plan-implied 88.9%** (index 0.79). Weakest: Creator Partners, Community Groups, Paid Social |
| 3 | *What should we do?* | `get_rule_evaluations` + `suggest_reallocation`: **stop** Paid Social (₹256 per registration, 14 days) and Creator Partners (₹134). Move ₹16,800 to the cheapest scaling channels for **+157 registrations / +100 visitors** |
| 4 | *Create a task for that* | `propose_task` drafts a **confirmation card**. Nothing is written until you click **Confirm**; the task then appears in TASK and ACT as `copilot` |
| 5 | Change data, ask again | On a campaign page (CMP → C07 → DATA), log a ₹5,000 row for 31 Mar. Community Groups' 14-day CPR goes from ₹25 to **₹103.1**, and its verdict and the copilot's answer change |
| 6 | *What was our Instagram CTR in 2023?* | `get_data_coverage`: *"the data doesn't contain this; it covers 15 Jan–20 Apr 2025"*, plus the closest answer it can support |

**Reset** (CFG → Reset dataset, or `POST /api/admin/reset`) restores the original data.

## 3. Architecture

```
Browser ─ Overview · KPI terminals · Funnel · Campaigns · Tasks · Planner · Activity · CFG · TERM
   │  Server Components (live reads)      Server Actions / REST (writes)       POST /api/chat (SSE)
   ▼
Next.js 16 on Vercel (Node, Fluid compute)
   ├─ lib/server/views.ts       page view-models built only from engine results
   ├─ lib/server/mutations.ts   the single write path: Zod → write → activity log → bump data version
   ├─ lib/analytics/*           PURE engine (no I/O): snapshot, funnel, KPIs, targets, projection,
   │                            scenario, bottleneck, trends, rules, reallocation, coverage
   └─ lib/copilot/*             tools → engine · provider chain (LM middleware) · trace recorder · claim grounding
   ▼
MongoDB Atlas: source collections + baseline_* twins · tasks · activity · settings · chat_sessions · meta
```

- **One engine.** The dashboard, the REST API and the copilot all call `lib/analytics`, so the chatbot's numbers always match the screen.
- **Always fresh, cheap to read.** Every write bumps `meta.data_version`. Each request reads only that counter and reloads the dataset only when it has changed, so edits show up on the next request. Wire compression keeps transfer well under Atlas M0's weekly cap.

| Layer | Choice (version) | Plan |
|---|---|---|
| Framework | Next.js 16.4 App Router, React 19, TypeScript strict | Vercel Hobby |
| DB | MongoDB Atlas, native driver 7.9, `attachDatabasePool` | M0 free (0.5 GB, 100 ops/s) |
| AI | Vercel AI SDK 7, `@ai-sdk/groq`, `@ai-sdk/google` | Groq free tier, Google AI Studio free tier |
| UI | Tailwind 4, React Flow 13 + dagre, 13 React Bits components | — |
| Validation / math | Zod 4, mathjs 15 (sandboxed) | — |
| Tests | Vitest 5, Playwright-core (screenshots), scripted copilot eval | — |

## 4. Data: sourced vs simulated vs assumed

**Source.** The RISA *Attendee Dataset.xlsx* is kept unchanged in `data/original/`; the seed checks its SHA-256 before importing. It's event-sourced and person-level. All 11 sheets are imported with Zod validation:

| Sheets | Content |
|---|---|
| campaigns, targets | Campaign briefs and the versioned target plans |
| daily marketing | Anonymous platform events and net spend per campaign per day |
| people, interactions | Identified people and their actions |
| registrations, status history | Registrations and every status version |
| check-ins | Admission attempts at the gate |

The full profile is in [docs/dataset.md](docs/dataset.md).

**Dataset rules the engine applies** (each is unit-tested):

| Rule | Effect on the original data |
|---|---|
| Deduplicate stable IDs | Removes 2 daily-marketing, 4 status-history and 20 check-in import copies |
| External people only | Excludes 40 internal, 10 staff and 10 test identities |
| Latest status at the as-of cutoff | Handles cancel → reconfirm correctly |
| Admitted + verified, distinct person | Excludes 50 denied and 30 pending check-ins; repeat attempts count once |
| Target version in force | Launch plan until 15 Mar, then the revised plan |
| Net spend | Vendor credits subtract |
| Two funnel layers | Anonymous events and identified people are never divided by each other |

**Labels used everywhere:** *Sourced* (with a URL), *Assumption*, *Dataset rule*, *Derived*. Anything created in the app is badged **USER** or **COPILOT**, edited dataset rows are flagged **edited**, and the 4 starter tasks are badged **SIMULATED**.

| Assumption | Value | Why |
|---|---|---|
| Venue capacity | 2,500 unique visitors (editable in CFG) | The dataset has no capacity field |
| Pre-event show-up | 72% base / 76% stretch | Sourced: PheedLoop free-event no-show medians. The data's actual result was 77.0% |
| Walk-ins | 5% of visitors | Assumption. The data's actual result was 125 of 2,050, about 6% |
| Registration close | End of the day before the event | Last observed registration: 10 Apr |
| Extra spend efficiency | 2× the recent average CPR | Diminishing returns |

## 5. Calculations

Every formula has a worked example in **[docs/calculations.md](docs/calculations.md)**. The figures are checked by `tests/engine.golden.test.ts` against an independent pandas computation (`tests/fixtures/golden.py`) on three dates.

Final results as of 20 Apr, against the revised plan:

| Goal | Actual | Target | Result |
|---|---|---|---|
| Identified people | 3,625 | 3,600 | **achieved** |
| Registrations | 2,800 | 3,200 | 87.5%, **missed** |
| Unique verified visitors | 2,050 | 2,200 | 93.2%, **missed** |
| Net spend | ₹2,74,000 | ₹3,00,000 | under budget |

Show-up rate: 1,925 ÷ 2,500 = **77.0%**.

## 6. Research and sources

See [docs/research.md](docs/research.md). Every number there is labelled *Sourced* or *Assumption*, with a URL. It covers:
- benchmark fest footfall (Mood Indigo, Saarang, Techfest, Oasis);
- the case for Bengaluru: 1,148 colleges, the most of any district in India (AISHE 2023-24);
- Meta India CTR, CPM and CPL benchmarks;
- free-event no-show rates;
- tool and platform limits (Vercel Hobby, Atlas M0, Groq free tier).

## 7. Prioritisation framework

**Day to day: rules.** Each campaign is judged on its cost per registration over the last 14 days, against the portfolio CPR, or against custom thresholds set on the campaign:

| Verdict | When |
|---|---|
| **Scale** | CPR ≤ 0.8× the portfolio CPR |
| **Stop** | CPR ≥ 1.5× the portfolio CPR |
| **Change** | CPR within thresholds, but CTR, session → start or click → session is below 80% of benchmark, cancellations exceed 15%, or show-up is weak |
| **Insufficient data** | Fewer than 15 registrations in the window |

**Reallocation** then moves budget from stop and change campaigns to scale campaigns, cheapest first.

**Planning: RICE.** Each campaign can store Reach, Impact, Confidence and Effort. Score = R × I × C ÷ E, computed in the campaign form.

## 8. Copilot design

- **Grounding through tools, not context stuffing.** The model gets a short header (as-of date, phase, target, campaign list) and **17 tools** that call the engine:
  - `get_overview`, `get_funnel`, `get_bottleneck`, `get_trends`, `get_daily_series`;
  - `list_campaigns`, `get_campaign` (fuzzy matching, with candidates when a name is ambiguous), `compare_campaigns`;
  - `get_rule_evaluations`, `suggest_reallocation`, `run_scenario`;
  - `list_tasks`, `get_activity`, `get_data_coverage`;
  - `calculate`, a mathjs sandbox: the model never does arithmetic in its head;
  - `propose_task`, `propose_campaign_update`.
- **Insight → action with confirmation.** The two `propose_*` tools only return validated drafts. The UI shows a card with Confirm, Edit and Discard; Confirm calls the same mutation path with `actor: "copilot"`.
- **Provider chain: Groq first, Gemini as fallback.** Implemented as language-model middleware, so the fallback happens per step inside multi-step tool loops.
  - Order: Groq `gpt-oss-120b` → `qwen3.8-27b` → `gpt-oss-20b`, across two Groq keys (separate quotas), then Gemini `3.8-flash` → `3.5-flash`.
  - A short "retry after N s" from the provider is honoured before falling back.
  - Every attempt, including failures and fallbacks, appears in the trace.
- **Tool router.** It offers only the tools relevant to the question, which keeps each call under the Groq free tier's roughly 8k tokens per minute. Earlier turns are passed to the model as text only.
- **Execution trace.** Recorded on the server from what actually ran, never from the model describing itself. It streams as a `data-trace` part and is drawn as a React Flow graph in TERM:
  - question → model steps (provider, key, latency, fallbacks) → tools (arguments, output size, time) → engine functions (formula, inputs) → sources, rules and assumptions → proposals → claims → answer.
- **Claim grounding.** Every number in the answer is matched against the numbers the tools returned, in this turn or earlier in the conversation. Numbers with no match are flagged **UNSUPPORTED**.
- **Honest uncertainty.** The system prompt makes `get_data_coverage` mandatory before saying the data can't answer, and requires correlation to be distinguished from causation.
- **Eval:** see §10.

## 9. Setup

```bash
npm install
cp .env.example .env            # MONGODB_URI, GROQ_API_KEY(2), GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_API_KEY_2, ADMIN_TOKEN, APP_PASSCODE
npm run seed                    # imports data/original → live + baseline_* collections (checks SHA-256)
npm run verify-seed             # cross-checks headline numbers straight from MongoDB
npm run dev                     # http://localhost:3000
```

**Reset** to the original data: CFG → Reset, `npm run seed -- --reset`, or `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" <url>/api/admin/reset`.

**Deploy (GitHub → Vercel dashboard):**
1. Push to GitHub, then import the repo in Vercel.
2. Add the env vars above.
3. Set the Node version to **22**, and the Functions region to match your Atlas cluster's region.
4. In Atlas → Network Access, allow `0.0.0.0/0`. Vercel Hobby has no static IPs.
5. On a fresh database, call `POST /api/admin/seed` once, with the bearer token. The workbook is bundled with that function.

**REST API:**

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/campaigns`, `GET/PATCH/DELETE /api/campaigns/:id` | Campaigns |
| `POST /api/campaigns/:id/metrics` | Daily metrics: JSON (one row) or `text/csv` (many) |
| `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id` | Tasks |
| `GET /api/overview`, `GET /api/funnel`, `GET /api/insights`, `POST /api/scenario` | Analytics |
| `GET /api/activity` | Change log |
| `POST /api/chat` | Copilot |

All analytics endpoints take `?asOf=YYYY-MM-DD`.

## 10. Testing

| Command | What it checks |
|---|---|
| `npm test` | **50 Vitest tests**: hand-built fixture edge cases (zero denominators, empty campaign, before history, look-ahead, cancel → reconfirm, duplicates, capacity cap, scenario arithmetic), golden tests on the real workbook, claim extraction and grounding, tool routing |
| `npm run verify-seed` | Headline numbers computed straight from MongoDB |
| `npm run eval` | The **copilot eval**: 31 cases across lookup, calculation, comparison, diagnosis, recommendation, follow-up, action, unanswerable, ambiguous, data quality and *after a data change*. Expected values are computed by the engine at run time. Results: [docs/eval-results.md](docs/eval-results.md) |
| `node scripts/shot.mjs` / `scripts/shot-copilot.mjs` | Real-browser screenshots, including driving the copilot terminal |

**Eval result:** _EVAL_RESULT_

## 11. Known limitations and next steps

- **Free-tier limits.** Groq's free tier is roughly 8k tokens per minute per model per key. The router, the compaction and a 6-model chain absorb bursts, but rapid back-to-back questions can still queue or fall back. A paid Groq tier would remove this.
- **Mid-stream errors.** A provider failure *mid-stream* (after the first token) isn't retried on another provider. Failures at request start are.
- **Show-up before the event** uses a sourced benchmark, because the dataset can't reveal it until the fest happens. The planner lets you stress-test it.
- **Single-instance rate limiter and in-memory dataset cache.** Correctness doesn't depend on them: freshness comes from the version counter.
- **No sponsorship (Challenge B) data.** Not chosen.
- **Next steps:**
  - Persistent multi-session chat history UI.
  - Simulating new campaigns forward in time.
  - Per-campaign budget plans.
  - A cost-per-visitor rule once attendance data accrues.

## 12. Reused, modified and verified

- **Reused:** Next.js `create-next-app` scaffold; **React Bits** components (MIT + Commons Clause, vendored and restyled monochrome in `components/reactbits/`: Counter, CountUp, DecryptedText, DotGrid, SplitFlapText, LatticeLoader, StatusMark, FaultyTerminal, Scanner, Noise, GlitchText, LetterGlitch, TextType); React Flow (MIT); dagre (MIT); Doto and Geist fonts (SIL OFL).
- **Written for this project:** the analytics engine, mutations, views, the copilot tools, provider chain, router, trace recorder and claim grounding, all pages, and the matrix chart components (TerminalChart, DotFunnel, DotBars, LedProgress, KpiSystem).
- **Verified by hand:**
  - pandas golden figures, and the worked examples in `docs/calculations.md`;
  - the end-to-end data-change loop: a logged row moves C07's 14-day CPR from ₹25 to ₹103.1 and the portfolio CPR from ₹73.58 to ₹80.87;
  - real-browser runs of the demo, including Groq rate-limit fallbacks shown in the trace.
- **Tools used:** Claude Code (implementation pair), VS Code, MongoDB Atlas (M0), Vercel (Hobby), Groq Console (free), Google AI Studio (free).
