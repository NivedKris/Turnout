# RISA attendee dataset: profile and mapping

Source: `data/original/Attendee Dataset.xlsx` (Google Drive, owner-shared, copied unchanged).
SHA-256 `d63f3e013e9a823e28ab0a0587703b2ed4344e443ade185606c2ce3427203469`. **Never edit this file.** The seed script reads it and verifies the hash.

## What it is
**CampusFest 2025**, a *fictional* two-day event on **12–13 April 2025**. Records cover **15 Jan to 20 Apr 2025**, in Asia/Kolkata (+05:30), with currency INR. All people are synthetic.
The dataset is **event-sourced and person-level**, not a pre-aggregated funnel. It's a complete history of a finished campaign, so the app must be able to **replay any "as-of" date**.

## Sheets

| Sheet | Rows | Grain | Key |
|---|---|---|---|
| Read me / Field guide | 8 / 86 | Rules and definitions | — |
| Event | 1 | Event | — |
| Targets | 2 | Versioned plan (`effective_at`) | `target_version` |
| Campaigns | 7 | Campaign | `campaign_id` C01–C07 |
| Daily Marketing | 483 (481 unique) | Campaign × day, **anonymous** counts + net spend | `activity_id` |
| People | 3,685 | Identity | `person_id` |
| Interest and Engagement | 11,650 | Identified action | `interaction_id` |
| Registrations | 2,840 | Registration (one per person) | `registration_id` |
| Registration History | 5,911 (5,907 unique) | Full-state status version | `history_id` |
| Check-ins | 3,390 (3,370 unique) | Admission attempt | `event_id` |

Owners: Meera Iyer (T03: C01, C04), Arjun Verma (T04: C02, C06), Nisha Rao (T05: C03, C07), Dev Malhotra (T06: C05).

Targets:

| Version | Effective (IST) | Identified external people | Registrations | Unique verified visitors | Budget |
|---|---|---|---|---|---|
| Attendee launch plan | 2025-01-15 09:00 | 3,200 | 2,800 | 1,800 | ₹2,40,000 |
| Attendee revised plan | 2025-03-15 09:00 | 3,600 | 3,200 | 2,200 | ₹3,00,000 |

## Traps the engine must handle (all deliberate)

1. **Import-retry duplicates:** 2 Daily Marketing, 4 Registration History and 20 Check-in rows repeat the same ID. Deduplicate by source ID.
2. **Non-external people:** 40 internal, 10 staff and 10 test identities. Targets count **external only**. 40 internal people have registrations and 40 non-external people have admitted check-ins. Exclude them all.
3. **Attendance definition:** count only `result=admitted` **and** `verification=verified`, external, **distinct `person_id`**. Excluded: 50 denied, 30 pending/unverified. People also make multiple admission attempts (scanner and manual overlap).
4. **Walk-ins:** 125 external people with no campaign and no registration were admitted. They count toward visitors but are **unattributed**, which isn't the same as zero cost.
5. **Status history:** for an as-of date, use the **latest version with `effective_at` ≤ end of that day** per `registration_id`. Statuses are interested, confirmed, cancelled and waitlisted, and can flip back (cancelled → confirmed).
6. **Targets change over time:** the target in force is the latest version with `effective_at` ≤ as-of.
7. **Negative spend:** 2 "marketing ledger adjustment" rows (−₹2,000 C03 on 04-16, −₹500 C05 on 04-18) are vendor credits on their posting date. Spend is net.
8. **Anonymous vs identified layers:** impressions, clicks, reach, sessions and starts are *events*, not people. Summed reach is **not** unique people. The funnel must show the two layers separately and not divide across them without saying so.
9. **No look-ahead:** as-of snapshots must never include later records.
10. **Repeated names:** 3 people share a name with someone else. Always join on IDs.
11. **Attribution:** a registration's `campaign_id` is the recorded acquisition source, an interaction's `campaign_id` is its action context, and `first_campaign_id` is the fixed first touch. The default is registration source, with first-touch as an alternative, explained in the UI.

## Final-state headline numbers (as of 2025-04-20, after the rules above). Used as engine test fixtures

| Measure | Actual | Revised goal | % |
|---|---|---|---|
| Identified external people | 3,625 (3,500 campaign + 125 walk-in) | 3,600 | 100.7% |
| External people registered | 2,800 | 3,200 | 87.5% |
| Unique verified external visitors | 2,050 (1,925 registered + 125 walk-in) | 2,200 | 93.2% |
| Net marketing spend | ₹2,74,000 | ₹3,00,000 | 91.3% |

Visitors by registration campaign: C01 390 · C02 340 · C03 175 · C04 385 · C05 275 · C06 195 · C07 165 · unattributed 125. Day split: 12 Apr 1,430 · 13 Apr 620.
Latest status of all registrations: confirmed 2,540 · cancelled 183 · waitlisted 88 · interested 29. All 1,925 registered attendees were in the confirmed state.

Spend and anonymous totals by campaign (deduplicated):

| Campaign | Impressions | Reach (summed) | Clicks | Sessions | Reg. starts | Net spend |
|---|---|---|---|---|---|---|
| C01 Campus Ambassadors | 136,929 | 89,152 | 4,862 | 3,685 | 968 | ₹42,000 |
| C02 Paid Social | 325,693 | 200,922 | 6,867 | 5,282 | 1,145 | ₹93,000 |
| C03 Creator Partners | 209,666 | 140,926 | 5,274 | 4,066 | 720 | ₹59,000 |
| C04 College Partnerships | 150,205 | 98,433 | 6,736 | 5,246 | 841 | ₹31,000 |
| C05 Student Referrals | 72,438 | 48,915 | 3,453 | 2,575 | 679 | ₹19,000 |
| C06 Organic Search | 68,402 | 45,091 | 2,404 | 1,893 | 714 | ₹14,000 |
| C07 Community Groups | 65,682 | 42,858 | 2,474 | 1,898 | 481 | ₹16,000 |

These are preliminary pandas figures. The TypeScript engine must reproduce them independently, and `docs/calculations.md` will show the working.

## Changes to plan.md this forces

- **Global "as-of" date** (time-travel slider, 15 Jan to 20 Apr 2025) drives every view and copilot tool. "Days left", run-rate and projection are relative to it. **This replaces `Date.now()` everywhere.**
- **Collections mirror the source tables** (`people`, `interactions`, `registrations`, `registration_history`, `checkins`, `campaign_daily`, `targets`, `campaigns`, `event`) with source IDs as unique keys, plus `source: "dataset"|"user"|"simulated"`. `metrics_daily` from §5 becomes `campaign_daily`.
- **Funnel (two layers):**
  - Anonymous: impressions → clicks → landing sessions → registration starts.
  - Identified: identified external people → engaged (brochure, question or email click) → registered → confirmed (as-of status) → verified visitor.
- **KPIs:** cost per registration, cost per verified visitor, show-up rate (confirmed → visited), cancellation rate, CTR, session → start rate. All per campaign and as-of.
- **Simulation is barely needed.** The data is complete. `simulate.ts` becomes optional, for "future" what-ifs only.
- **Manage/CRUD** writes user records (new campaign, daily metrics, status change, check-in) with `source:"user"` dated inside the window, so analytics change.
- **City** isn't in the dataset. The fictional fest is set in our chosen city for copy and context only.
