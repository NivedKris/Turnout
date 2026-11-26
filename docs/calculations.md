# Calculations

Every number in the app and the copilot comes from one engine, `lib/analytics/`: pure TypeScript functions with no I/O. Each function returns `{ value, formula, inputs, assumptions, sources }`, so the UI and the copilot can show their working.

The worked examples below use the **original dataset**. The figures are asserted in `tests/engine.golden.test.ts` against values computed independently in pandas (`tests/fixtures/golden.py`).
Reproduce them with `npx tsx scripts/engine-report.mts 2025-03-31`.

---

## 1. Snapshot rules (applied before any metric)

| Rule | Implementation | Effect on the original data |
|---|---|---|
| As-of = end of that IST day | `cutoff = endOfDayIst(asOf)` = 23:59:59.999 +05:30 | No later record is counted |
| Deduplicate by source ID | first occurrence of `activity_id`, `history_id`, `event_id`, … | −2 daily rows, −4 status versions, −20 check-ins |
| External people only | `person_type = external` | −40 internal, −10 staff, −10 test |
| Latest status | per `registration_id`, the latest `effective_at ≤ cutoff` (ties: higher `history_id`) | Cancel → reconfirm handled |
| Verified attendance | `result = admitted` and `verification = verified`, external, **distinct person** | −50 denied, −30 pending, −40 non-external, repeat attempts once |
| Target in force | latest `targets.effective_at ≤ cutoff` | Launch plan until 15 Mar 09:00, then revised plan |
| Net spend | sum of `marketing_spend_inr` (credits are negative) | −₹2,500 of vendor credits |

Summed impressions with duplicates are 1,032,918; deduplicated they're **1,029,015**. This is exactly the kind of trap the golden tests catch.

## 2. Funnel (two layers, never divided across)

**Anonymous events:** impressions → clicks → landing sessions → form starts.
**Identified people:** identified (campaign-acquired) → engaged (high-intent action) → registered → confirmed → attended.
Each conversion = stage ÷ previous stage. Walk-ins are added after the identified layer, never inside a conversion rate.

Final state (20 Apr 2025):

| Stage | Value | Conversion |
|---|---|---|
| Impressions | 1,029,015 | — |
| Clicks | 32,070 | 3.12% |
| Landing sessions | 24,645 | 76.8% |
| Form starts | 5,548 | 22.5% |
| Identified (campaign) | 3,500 | — |
| Engaged | 3,317 | 94.8% |
| Registered | 2,800 | 84.4% |
| Confirmed | 2,500 | 89.3% |
| Attended (registered) | 1,925 | **77.0%** (show-up) |
| + Walk-ins | 125 | — |
| **Unique verified visitors** | **2,050** | |

**Show-up** = registered verified visitors ÷ registrations confirmed **at event start** = 1,925 ÷ 2,500 = **77.0%**. The sourced benchmark for large free events is ≈76%.

## 3. Campaign KPIs

- CTR = clicks ÷ impressions
- CPR (cost per registration) = net spend ÷ registrations
- Cost per visitor = net spend ÷ verified visitors
- Confirm rate = confirmed ÷ registrations
- Cancel rate = cancelled ÷ registrations

Worked example, full period: Paid Social (C02) spent ₹93,000 for 680 registrations → CPR = 93,000 ÷ 680 = **₹136.76**. College Partnerships (C04) spent ₹31,000 for 450 registrations → **₹68.89**.

A zero denominator returns `null` (shown as "—"), never 0 or ∞.

## 4. Target vs actual

- pct = actual ÷ goal
- required/day = (goal − actual) ÷ days left
- current/day = trailing 7-day average
- status, from the base projection: ≥ goal on track, ≥ 90% at risk, else off track. Once the goal can no longer move, the status is **achieved** or **missed**.

Days left = whole days after the as-of until registrations close. Registrations are assumed to close at the end of the day before the event, 11 Apr. The last observed registration is 10 Apr.

**Worked example, 31 Mar 2025 (revised plan in force):**

| Goal | Actual | Goal | % | Required/day | Current/day | Projected | Status |
|---|---|---|---|---|---|---|---|
| Identified | 3,320 | 3,600 | 92.2% | (3,600 − 3,320) ÷ 11 = 25.5 | 57.0 | 3,947 | on track |
| Registrations | 2,337 | 3,200 | 73.0% | (3,200 − 2,337) ÷ 11 = 78.5 | 350 ÷ 7 = 50.0 | 2,887 | **at risk** |
| Visitors | 0 | 2,200 | — | n/a (event days only) | — | 1,837 | **off track** |
| Spend | ₹2,48,150 | ₹3,00,000 | 82.7% | | ₹3,785.7 | ₹2,89,793 | under budget |

**Final (20 Apr):** identified 3,625 / 3,600 (**achieved**), registrations 2,800 / 3,200 = 87.5% (**missed**), visitors 2,050 / 2,200 = 93.2% (**missed**), spend ₹2,74,000 / ₹3,00,000 (under budget).

## 5. Projection (base and stretch)

```
projected registrations = Σ_c ( current_c + daily_rate_c × days_left )
visitors = min( capacity, registrations × confirmed_share × show_up ÷ (1 − walk_in_share) )
```

- **Base:** daily_rate_c = the campaign's trailing 7-day registrations ÷ 7. Show-up = 72% (Sourced, free events).
- **Stretch:** daily_rate_c = the campaign's **best** 7-day window so far. Show-up = 76% (Sourced, large free events).
- confirmed_share = confirmed ÷ registrations at the as-of date (Derived). walk_in_share = 5% (Assumption). Capacity = 2,500 (Assumption, editable).
- After the event the projection returns the observed outcome.

**Worked example, 31 Mar (base):**
1. Trailing 7 days (25–31 Mar): 350 registrations → 50.0/day across campaigns.
2. Registrations = 2,337 + 50 × 11 = **2,887**.
3. confirmed_share = 1,962 ÷ 2,337 = 83.95%, so confirmed = 2,887 × 0.8395 = 2,423.8.
4. Registered visitors = 2,423.8 × 0.72 = 1,745.1.
5. Visitors = 1,745.1 ÷ 0.95 = **1,837** (< capacity 2,500).
6. Spend = 2,48,150 + (26,500 ÷ 7) × 11 = **₹2,89,793**.

Stretch on 31 Mar: 3,077 registrations, 2,067 visitors. Even the stretch case misses the 2,200 visitor goal unless conversion improves. That is the decision point.

## 6. Bottleneck

For each stage: **index = actual conversion ÷ benchmark**. The bottleneck is the lowest index below 1 with at least 50 records in its denominator. The worst campaigns are listed for that stage.

| Stage | Benchmark | Label |
|---|---|---|
| CTR | 1.0% | Sourced (Meta India) |
| Click → session | 70% | Assumption |
| Session → start | 15% | Assumption |
| Identified → registered | registration goal ÷ identified goal (3,200 ÷ 3,600 = 88.9%) | Derived from the plan |
| Registered → confirmed | 90% | Assumption |
| Confirmed → attended | 72% | Sourced (free events) |

**31 Mar:** identified → registered = 2,337 ÷ 3,320 = 70.4% vs 88.9% → **index 0.79, the bottleneck**. Worst: Creator Partners 61.0%, Community Groups 67.4%, Paid Social 68.2%.

## 7. Trends

change = metric[last N days] − metric[previous N days]. For additive metrics, contribution_c = change_c ÷ total change (contributions sum to 100%).
31 Mar, 7-day registrations: 350 vs 336 (+4.2%).
Trends show association over time, not proof of what caused a change.

## 8. Scale / keep / change / stop rules

- Window: the last 14 days up to min(as-of, registration close).
- Metric: CPR by default (configurable per campaign).
- Thresholds: when no custom ones are set, they're relative to the portfolio CPR over the same window, because the source has no per-campaign cost targets.

| Verdict | Condition |
|---|---|
| insufficient_data | < 15 registrations in the window |
| scale | CPR ≤ 0.8 × portfolio CPR |
| stop | CPR ≥ 1.5 × portfolio CPR (or the campaign is already stopped) |
| change | within thresholds, but a signal is weak: CTR, click→session or session→start < 80% of benchmark; cancellations > 15%; show-up < 80% of 72% |
| keep | otherwise |

**31 Mar:** portfolio CPR = ₹50,475 ÷ 686 = **₹73.58** → scale if ≤ ₹58.86, stop if ≥ ₹110.37.
Paid Social = ₹19,200 ÷ 75 = **₹256 → stop**. Creator Partners = ₹12,200 ÷ 91 = ₹134 → stop. Community Groups = ₹1,600 ÷ 64 = ₹25 → scale.

## 9. Reallocation

- **Future spend** per campaign = trailing 7-day daily spend × days left.
- **Donors:** stop campaigns give 100% of their future spend, change campaigns give 50%. Any **unallocated budget** is added: budget − spend to date − planned future spend.
- **Recipients:** scale campaigns ranked by recent CPR, each capped at +1× its planned future spend.
- **Effect** = scenario(moves) − base. Removed spend loses registrations at the donor's recent CPR. Added spend gains them at **2×** the recipient's recent CPR (diminishing-returns Assumption).

**31 Mar:** moves ₹16,800 from Paid Social and Creator Partners to Referrals, Organic, Ambassadors and College Partnerships → **+157 registrations, +100 projected visitors**.

## 10. Scenario planner

The same projection model with changes applied:
- `shift_budget`, `add_budget`
- `scale_campaign` (multiplies its rate and spend)
- `stop_campaign`
- `set_show_up_rate`, `set_walk_in_share`, `set_capacity`

The output is base, scenario and delta. Example: "show-up drops to 60%" on 31 Mar → visitors = 2,423.8 × 0.60 ÷ 0.95 = 1,531.
