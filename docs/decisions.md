# Decisions (§0 of plan.md)

| # | Question | Decision | Date |
|---|---|---|---|
| 1 | Track | **A: Attendee Growth** | 2026-11-26 |
| 2 | City | **Bengaluru (recommended, pending confirmation).** Densest college base in India, see `research.md` §2b | 2026-11-26 |
| 3 | Dataset | **Pending.** Location of the RISA dataset not yet provided | — |
| 4 | LLM | **Google Gemini** (`gemini-3.8-flash`), behind `lib/copilot/provider.ts`; Anthropic kept as a fallback | 2026-11-26 |
| 5 | MongoDB | Existing Atlas cluster. `MONGODB_URI` is in local `.env` | 2026-11-26 |
| 6 | Deploy | Push to GitHub, then import and deploy through the **Vercel dashboard** (no Vercel CLI) | 2026-11-26 |
| 7 | Display font | **Doto** (OFL) for display; Geist Sans / Geist Mono for UI and data | 2026-11-26 |
| 8 | Animated components | **React Bits** (MIT + Commons Clause), copied in as TS + Tailwind, restyled to monochrome | 2026-11-26 |
| 9 | Copilot trace UI | **Node/edge graph + Bloomberg-terminal-style trace panel** (see plan.md §15) | 2026-11-26 |

## Environment notes
- `.env` defines `MONGODB_URI` **twice**. Only one should remain.
- `.env` uses `GEMINI_API_KEY`. The app will read `GOOGLE_GENERATIVE_AI_API_KEY` and fall back to `GEMINI_API_KEY`, so either works. Use the standard name in Vercel.
- `.env` is git-ignored.
