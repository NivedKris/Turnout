# Decisions (§0 of plan.md)

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | Track | **A: Attendee Growth** | 2026-11-26 |
| 2 | City | **Bengaluru.** Densest college base in India (1,148 colleges, AISHE 2023-24) and home to the D2C/fintech/gaming sponsor base. See `research.md` §2b. The dataset's fictional CampusFest is framed as a Bengaluru fest | 2026-11-26 |
| 3 | Dataset | `data/original/Attendee Dataset.xlsx` (from Google Drive), profiled in `docs/dataset.md` | 2026-11-26 |
| 4 | LLM | **Google Gemini** (`gemini-3.8-flash`), behind `lib/copilot/provider.ts`; Anthropic kept as a fallback | 2026-11-26 |
| 5 | MongoDB | Existing Atlas cluster. `MONGODB_URI` is in local `.env` | 2026-11-26 |
| 6 | Deploy | Push to GitHub, then import and deploy through the **Vercel dashboard** (no Vercel CLI) | 2026-11-26 |
| 7 | Display font | **Doto** (OFL) for display; Geist Sans / Geist Mono for UI and data | 2026-11-26 |
| 8 | Animated components | **React Bits** (MIT + Commons Clause), copied in as TS + Tailwind, restyled to monochrome | 2026-11-26 |
| 10 | Default as-of date | **Latest date in the data (2025-04-20, the dataset's `history_end`)**. The brief says the chatbot is tested on the *original data*, *changed data* and *calculations*, so default answers must match the full dataset. Any date can be chosen with the global as-of selector, and the copilot accepts explicit dates ("as of 31 March"). The demo workflow time-travels to **31 Mar 2025** to show a live "are we on track?" moment | 2026-11-26 |
| 11 | Dataset in git | **Committed.** Synthetic assignment material, needed for a reproducible seed and for the "original data available for testing" requirement | 2026-11-26 |
| 12 | Scope split | The app delivers Part 2. The 3-slide strategy deck (Part 1) is the user's own work. The app's planner and README numbers feed it | 2026-11-26 |
| 9 | Copilot trace UI | **Node/edge graph + Bloomberg-terminal-style trace panel** (see plan.md §15) | 2026-11-26 |

## Environment notes
- `.env` defines `MONGODB_URI` twice, but the two values are identical, so this is harmless.
- `.env` uses `GEMINI_API_KEY`. The app will read `GOOGLE_GENERATIVE_AI_API_KEY` and fall back to `GEMINI_API_KEY`, so either works. Use the standard name in Vercel.
- `.env` is git-ignored.
