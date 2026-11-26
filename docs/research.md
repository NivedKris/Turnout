# Phase 0 research

Research date: **2026-11-26**. Every number is labelled **Sourced** (with a URL), **Sourced (npm)** (checked with `npm view` on the research date) or **Assumption**.
Many web sources are vendor blogs. Where sources disagree, the conflict is noted.

---

## 1. Technical stack: versions and constraints

| Item | Value | Source | Label | Notes |
|---|---|---|---|---|
| Next.js | **16.4.6** (latest); 16.5 in preview | `npm view next` | Sourced (npm) | 16.x is Active LTS: https://nextjs.org/support-policy |
| React | 19.3.1 | `npm view react` | Sourced (npm) | |
| Vercel AI SDK (`ai`) | **7.0.183** | `npm view ai` | Sourced (npm) | v7 shipped June 2026 and **requires Node ≥ 22**: https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 |
| `@ai-sdk/react` (`useChat`) | 4.0.188 | `npm view` | Sourced (npm) | |
| `@ai-sdk/google` | 4.0.128 | `npm view` | Sourced (npm) | Reads env `GOOGLE_GENERATIVE_AI_API_KEY` by default |
| `@ai-sdk/anthropic` | 4.0.110 | `npm view` | Sourced (npm) | Kept as a swappable fallback |
| Multi-step tool use | `streamText({ tools, stopWhen: stepCountIs(n) })` | https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 | Sourced | v7 renamed some stop-condition imports. Check against the installed version's types |
| MongoDB Node driver | **7.9.1** | `npm view mongodb` | Sourced (npm) | Native driver chosen over Mongoose (9.13.1). Zod is already the schema layer |
| Vercel ↔ Mongo pooling | `attachDatabasePool(client)` from `@vercel/functions` (3.11.4) plus a module-level cached `MongoClient` | https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute | Sourced | MongoDB is listed as a supported client. Community reports of connection storms: https://www.mongodb.com/community/forums/t/vercel-mongodb-just-killed-my-website/329414 |
| Pool settings | `maxPoolSize` 5–10, short `maxIdleTimeMS` | https://oneuptime.com/blog/post/2026-03-31-mongodb-configure-connection-pool-serverless/view | Sourced (3rd party) | |
| Atlas M0 | 100 ops/sec, fixed storage (commonly 512 MB), weekly data-transfer cap, one free cluster per project | https://mongodb.com/docs/atlas/reference/free-shared-limitations/ | Sourced | 512 MB not confirmed in the snippet. Our dataset will be well under 5 MB |
| Atlas network access for Vercel | Allow `0.0.0.0/0`. Vercel Hobby has no static egress IPs | https://vercel.com/marketplace/mongodbatlas/atlas | Sourced | Acceptable for a demo because the credentials are strong |
| Vercel Hobby function duration | **300 s default and max** with Fluid compute (on by default) | https://vercel.com/docs/functions/limitations | Sourced | Pre-Fluid limit was 60 s. Set `export const maxDuration = 60` on `/api/chat` |
| Vercel Hobby memory | 2 GB | https://vercel.com/docs/functions/limitations | Sourced | |
| Gemini model | **`gemini-3.8-flash`** (newest stable Flash, released 2026-09-02) | https://ai.google.dev/gemini-api/docs/models · https://firebase.google.com/docs/ai-logic/models | Sourced | Fallback: `gemini-3.5-flash` (retires ≥ May 2027). 2.5 Flash retired 2026-10-20 |
| Gemini free-tier limits | **Not published any more.** Visible per-key in AI Studio. 429 `RESOURCE_EXHAUSTED` when exceeded | https://ai.google.dev/gemini-api/docs/rate-limits | Sourced | Design: cap tool steps at 8, retry with backoff, friendly error |
| Graph library | `@xyflow/react` **13.0.3** (React Flow), MIT | `npm view`, https://www.npmjs.com/package/@xyflow/react | Sourced (npm) | Major version 13 is new. Check its migration notes before building |
| Graph auto-layout | `elkjs` 0.12.2 or `@dagrejs/dagre` 3.1.4 | `npm view` | Sourced (npm) | Dagre is simpler. ELK if layered traces get dense |
| Validation | `zod` 4.6.7 | `npm view` | Sourced (npm) | AI SDK tool schemas accept Zod |
| Safe math | `mathjs` 15.3.0 | `npm view` | Sourced (npm) | Use `create(all)` with `import`/`createUnit`/`evaluate` re-definitions disabled |
| Styling | `tailwindcss` 4.3.5 | `npm view` | Sourced (npm) | |
| Motion | `motion` 14.14.0 | `npm view` | Sourced (npm) | |
| Tests | `vitest` 5.1.2 | `npm view` | Sourced (npm) | |
| Local Node | v22.22.1 | `node -v` | Sourced | Meets AI SDK 7 requirement. Set Vercel project to Node 22+ |

### Fonts

| Font | Licence | Use | Source |
|---|---|---|---|
| **Doto** | SIL OFL 1.1. Variable axes for dot size and roundness, 6×10 matrix, monospace | Hero numbers and display (≥ 28 px) | https://fonts.google.com/specimen/Doto/about · `@fontsource/doto` 5.3.0 |
| DotGothic16 | SIL OFL (Google Fonts) | Alternative display | https://fonts.google.com/specimen/DotGothic16 |
| **Geist / Geist Mono** | SIL OFL (`geist` 1.9.2) | UI body / tables / tabular numerals | https://vercel.com/font |
| NDot (Nothing) | Proprietary | **Not used** | — |

**Decision:** Doto is the dot-matrix display font, loaded via `next/font/google`. Its variable dot-size axis lets the same font look "lit" or "dim". Geist Sans is used for UI and Geist Mono for data.

### React Bits (user-provided)

Licence: **MIT + Commons Clause**. Free for use inside an app. Components can't be resold or redistributed on their own. Source: https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md
Install: `npx shadcn@latest add https://reactbits.dev/r/<Name>-TS-TW` (source copied into the repo). The site advises "two or three effects per page", which matches the plan's restraint rule.

Shortlist (free tier only):

| Component | Where we use it |
|---|---|
| Dot Grid / Dot Field | App background (subtle, edge-masked) |
| Count Up / Counter | KPI tickers when a value changes |
| Decrypted Text / Shuffle / Split Flap Text | Copilot answer reveal, terminal headers, the "as of" clock |
| Lattice Loader | Copilot "thinking" (5×5 lattice), replaces a custom one |
| Call Chip / Status Mark / Thought Line | Tool-call chips, task status glyphs, trace header |
| Scanner / Faulty Terminal (sparingly) | Copilot terminal panel backdrop only |
| Noise | Very light grain on glass panels |

All are restyled to monochrome. Effects are disabled under `prefers-reduced-motion` and swapped for static versions on mobile.

---

## 2. Domain: Indian college fests (Track A, Attendee Growth)

### 2a. Benchmark fests

| Fest | Metric | Value | Source | Label | Notes |
|---|---|---|---|---|---|
| Mood Indigo, IIT Bombay | Attendance | 1,50,000+ (2022) | https://en.wikipedia.org/wiki/Mood_Indigo_(festival) | Sourced | Organiser figure |
| Mood Indigo 2025 | Crowd control failure | Pre-registrations cancelled, outsiders barred after gate crush | https://news.careers360.com/iit-bombay-cancels-mood-indigo-pre-registrations-stops-entry-outsiders-crowd-chaos-seedhe-maut-concert-sonu-nigam-vicky-kaushal | Sourced | **Capacity and gating matter. Our projection caps at venue capacity** |
| Mood Indigo 2025 | Paid passes reported | ₹4,200 (attendee complaint) | https://www.freepressjournal.in/lifestyle/worst-decision-netizens-troll-mood-indigo-iit-bombay-fest-after-paying-4200-standing-for-10-hours-with-no-accommodation | Sourced (media) | Anecdotal |
| Saarang, IIT Madras | Expected footfall | 80,000+ (2026 edition, 8–12 Jan) | https://www.iitm.ac.in/happenings/press-releases-and-coverages/saarang-returns-iit-madras-8-12-jan-2026-new-experiences | Sourced | Same projection in 2024/25 releases, so it is a standing estimate |
| Techfest, IIT Bombay | Record footfall | 1,65,000 (2015–16) | https://en.wikipedia.com/wiki/Techfest | Sourced | Undated claim of 1,75,000+: https://events.yourstory.com/partners/techfest |
| Oasis, BITS Pilani | Attendance | 8,000–10,000 from 350+ colleges | https://en.wikipedia.org/wiki/Oasis_(festival) | Sourced (uncited on wiki) | Remote campus, so a smaller crowd |
| Rendezvous, IIT Delhi | Footfall | Not found | — | — | Gap |

### 2b. City choice: college student base

| City / district | Metric | Value | Source | Label |
|---|---|---|---|---|
| **Bengaluru Urban** | Colleges | **1,148, the most of any district in India** (AISHE 2023-24) | https://www.dohe-education.gov.in/static/uploads/2026/07/8616f33dfee644ab6b87a2bd0658b18d.pdf | Sourced |
| Pune | Colleges | 517 | same | Sourced |
| Hyderabad | Colleges | 465 (+ Ranga Reddy 338) | same | Sourced |
| Karnataka (state) | HE enrolment | ~29.9 lakh (AISHE 2023-24) | https://www.deccanherald.com/education/karnataka-continues-to-record-highest-college-density-in-india-past-5-years-aishe-report-4067791 | Sourced |
| Bangalore University | Affiliated enrolment | 3,00,000+ across 500+ colleges | https://en.wikipedia.com/wiki/Education_in_Bangalore | Sourced (wiki) |
| India | HE enrolment | 4,50,01,123 (AISHE 2023-24) | AISHE 2023-24 report (above) | Sourced |
| Bengaluru metro | College students | **~8–10 lakh** | Derived from the district's college count and the state enrolment | **Assumption** |

**Recommendation: Bengaluru.**
- It has the densest college base in India (1,148 colleges), so there is the most addressable audience for ambassadors and partnerships.
- It's home to the D2C, fintech, edtech and gaming brands that sponsor fests.
- It has a strong live-music and pro-show culture.
- It lets us ground "reach" in a real, sourced number.

Pune is the runner-up ("Oxford of the East", 517 colleges).

### 2c. Funnel conversion benchmarks

| Stage | Metric | Value | Source | Label | Use in app |
|---|---|---|---|---|---|
| Reach → click | Meta CTR, India | 1.0–1.5% (avg ~0.9% all-industry globally; > 1.2% = good) | https://owlclaw.com/benchmarks/meta-ads-benchmarks-india | Sourced (vendor) | Benchmark for `clicks/reach` |
| Ad cost | Instagram CPM, India | ₹45–350 (Reels ₹45–140, Feed ₹150–350) | https://upgrowth.in/instagram-ads-pricing-india-2026/ | Sourced (vendor) | Seed spend sanity check |
| Ad cost | Meta CPC, India | ₹8–25 most industries | https://owlclaw.com/benchmarks/meta-ads-benchmarks-india | Sourced (vendor) | |
| Lead cost | Meta CPL, India | ₹150–400 (lead gen); ₹120–280 WhatsApp lead forms | same | Sourced (vendor) | Upper bound for cost per registration |
| Click → registration | Landing conversion | **15–30%** for a free, one-tap student RSVP | — | **Assumption** | No reliable India source found |
| Registration → attendance | Free-event no-show | **~28% median** (large free events, 500+: ~24%) | https://pheedloop.com/blog/event-data-lab-report-5 | Sourced (n=389 events) | **Show-up benchmark ≈ 72–76% for free** |
| Registration → attendance | Paid-event no-show | ~17% median | same | Sourced (n=683) | Show-up ≈ 83% for paid passes |
| Registration timing | Free-event attendance by lead time | 28.2% (same week) to 59.3% (2–3 months) | https://pheedloop.com/blog/event-data-lab-report-09-late-registrants-arent-flakier-their-events-are-different | Sourced | Conflicting sign; use as a caution, not a model input |
| Registration → attendance | Vendor rule of thumb | Free: 40–60% no-show; paid: 90–97% attendance | https://www.nunify.com/blogs/event-attendance-rate | Sourced (vendor) | Pessimistic bound for scenario planner |
| Planning buffer | Logistics | Plan for 70% (free) / 80% (paid) of registrations | https://pheedloop.com/blog/event-data-lab-report-5 | Sourced | Default capacity-planning ratio |
| Ambassadors | Referral conversion | Not published | https://unstop.com/internships/campus-ambassador-internship-apogee-26-bits-pilani-under-steel-skies-bits-1631127/amp | — | Model as an **Assumption** if the dataset doesn't contain it |

### 2d. Sponsorship (context only for Track A)

Deferred: Track A was chosen. Sponsor categories (D2C, edtech, fintech, beverages, telecom, gaming) are kept as a free-text `partnerships` channel tag only.

---

## 3. Design implications from the research

1. **Capacity cap is real** (the 2025 Mood Indigo crush), so the projection is `min(projected, capacity)` and the scenario planner warns when the stretch target exceeds capacity.
2. **Show-up is the most volatile stage** (24–60% no-show across sources), so it's the default "what if" in the planner and a likely bottleneck candidate.
3. **Gemini free-tier limits are opaque**, so the copilot keeps step counts low, caches `get_overview` per request, and retries on 429.
4. **AI SDK 7 needs Node 22**, so pin `"engines": { "node": ">=22" }` and set the Vercel project's Node version.

## 4. Open gaps

- No source for click → registration conversion for Indian student events (Assumption 15–30%).
- No public ambassador referral conversion data.
- No current Bengaluru-only enrolment figure (derived assumption).
- Gemini 3.8 Flash free-tier RPM/RPD must be read from AI Studio for the actual key.
