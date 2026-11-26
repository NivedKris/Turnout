# Diagram prompts

Five diagrams for the README and the paper. Generate each image, then save it under the file name given, in `paper/figures/` (the paper picks them up automatically; until then it shows a labelled placeholder box).

**Shared style (paste at the start of every prompt):**
> Clean technical diagram for a research paper. White background, black and dark-grey lines and text, one accent colour only (green #22c55e) for the single most important path. Flat vector style, thin 1.5 px strokes, rounded rectangles, small dot-matrix (LED-style) font for titles and a clean sans-serif (like Inter or Geist) for labels. No 3D, no shadows, no gradients, no clip-art, no people, no logos. Generous white space, left-to-right flow, 16:9 landscape, readable when printed at A4 width. Use exactly the labels given; do not add any other text.

---

## 1. `architecture.jpg`: system architecture

> Three horizontal layers, top to bottom, connected by labelled arrows.
> **Top layer, "Browser":** five boxes side by side: "Dashboard pages (Overview, Funnel, Campaigns, KPI terminals)", "Strategy (Goal plan, Bets, Decisions)", "Manage (Tasks, Team, Activity)", "Copilot terminal + trace graph", "Voice assistant (Gemini Live)".
> **Middle layer, "Next.js 16 on Vercel":** four boxes: "Views (read models)", "Mutations (single write path: validate → write → log → bump version)", "Analytics engine (pure functions: snapshot, funnel, projection, rules, reallocation, strategy)", "Copilot (tools → engine, provider chain, trace recorder, claim grounding)". Draw arrows from Views and Copilot into the Analytics engine, labelled "same functions".
> **Bottom layer, "MongoDB Atlas M0":** one wide box listing "campaigns · campaign_daily · people · interactions · registrations · registration_history · checkins · targets · event · tasks · bets · decisions · goal_model · activity · settings · meta.data_version".
> **External boxes on the right:** "Groq (primary LLM)" and "Google Gemini (fallback LLM + Live voice)", connected to "Copilot" with arrows labelled "tool-calling" and to "Voice assistant" with "ephemeral token".
> Arrow labels between layers: Browser→Next.js "Server Components (reads) · Server Actions (writes) · /api/chat (stream)"; Next.js→MongoDB "read dataset when version changes · write + bump version".
> Accent colour on the path Browser → Copilot → Analytics engine → MongoDB.

## 2. `data-flow.jpg`: how a data change reaches every answer

> A loop of six steps drawn as a circle of rounded boxes with arrows, clockwise:
> 1 "User edits data (log a spend row, change a campaign, create a task)" → 2 "Mutation: validate (Zod) → write to MongoDB → activity log" → 3 "Bump meta.data_version" → 4 "Next request sees a new version → reload dataset (memory → disk pack → Mongo)" → 5 "Analytics engine recomputes as of the selected date" → 6 "Dashboard, KPI terminals and copilot all show the new numbers" → back to 1.
> In the centre: a small box "One engine, one dataset version: the chatbot can never disagree with the screen".
> Accent colour on steps 3 and 4.

## 3. `copilot-loop.jpg`: how the copilot answers

> Left to right, five columns with headings in dot-matrix font: "MODEL", "TOOLS", "ENGINE", "DATA & RULES", "ANSWER".
> Before the first column, a box "Question + as-of date" with an arrow into a diamond "Tool router (picks ≤ 10 relevant tools)".
> MODEL column: a vertical stack "Groq gpt-oss-120b → qwen3.8-27b → gpt-oss-20b (key 1, key 2) → Gemini 3.8 Flash → Gemini 3.5 Flash", with small dashed arrows between them labelled "429 / error → next".
> TOOLS column: chips "get_overview", "get_bottleneck", "get_rule_evaluations", "suggest_reallocation", "run_scenario", "calculate (mathjs)", "get_data_coverage", "propose_task".
> ENGINE column: "targetVsActual", "projection", "bottleneck", "evaluateRules", "reallocation".
> DATA & RULES column: "registrations", "campaign_daily", "rule: CPR ≥ 1.5× portfolio → stop", "assumption: show-up 72% (sourced)".
> ANSWER column: a box "Answer" and under it "Claim check: every number matched to a tool output → GROUNDED / UNSUPPORTED".
> A separate branch from "propose_task" to a box "Proposal card: nothing saved until the person clicks Confirm".
> Thin grey curved connectors between columns; accent colour on one complete path: Question → gpt-oss-120b → get_rule_evaluations → evaluateRules → rule → Answer.

## 4. `strategy-loop.jpg`: measure, diagnose, decide, manage

> Four large rounded boxes in a clockwise loop:
> "MEASURE: funnel, KPIs vs goal, projection to event day" → "DIAGNOSE: bottleneck stage, weekly drivers, campaign rules" → "DECIDE: scale / keep / change / stop, budget reallocation, what-if planner" → "MANAGE: tasks with owners, decision log, outcome 14 days later" → back to MEASURE.
> In the centre: "As-of date (time machine: any day 15 Jan – 20 Apr 2025)".
> Outside the loop on the right: a box "AI copilot + voice: asks, explains, proposes; a person confirms" with dotted lines to all four boxes.
> Accent colour on the arrow DECIDE → MANAGE.

## 5. `funnel-math.jpg`: base vs stretch plan

> Two vertical funnels side by side, titled "BASE" and "STRETCH".
> BASE stages (top to bottom): "Students in 5 segments 8,30,000" → "Reached 41,000" → "Identified 3,928" → "Registered 3,108" → "Confirmed 2,766 (× 89%)" → "Attend 1,992 (× 72% show-up)" → "+ walk-ins 105" → "Visitors 2,097".
> STRETCH stages: "Reached × 1.25" → "Identified 4,910" → "Registered 4,196 (× 1.08)" → "Confirmed 3,735" → "Attend 2,838 (× 76%)" → "+ walk-ins 149" → "2,988 → capped at 2,500 (venue capacity)".
> A horizontal dashed line across both labelled "Revised goal: 2,200 visitors".
> Accent colour on the capacity cap.
