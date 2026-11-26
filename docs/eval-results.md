# Copilot eval results

Run: 2026-11-26T15:20:42.552Z against `http://localhost:3123`. Expected values are computed by the analytics engine from the live database at run time (not hard-coded).

**Pass rate: 29/30 (96.7%)** · numeric claims grounded: 172/193 (89.1%)

| Category | Passed |
|---|---|
| lookup | 5/5 |
| calculation | 4/4 |
| comparison | 3/3 |
| diagnosis | 3/3 |
| recommendation | 3/3 |
| follow-up | 2/2 |
| action | 2/2 |
| unanswerable | 4/4 |
| ambiguous | 0/1 |
| data quality | 2/2 |
| after data change | 1/1 |

| ID | Category | Question(s) | Result | Check | Tools | Grounded | Model(s) | ms |
|---|---|---|---|---|---|---|---|---|
| L1 | lookup | How many registrations do we have so far? | PASS | found 2,337 ≈ 2337 | get_overview | 3/3 | openai/gpt-oss-120b@groq#1 | 5867 |
| L2 | lookup | What's our net marketing spend to date? | PASS | found ₹2,48,150 ≈ 248150 | list_campaigns, calculate | 9/10 | openai/gpt-oss-120b@groq#1 | 6546 |
| L3 | lookup | How many unique verified visitors attended the festival? | PASS | found 2,050 ≈ 2050 | get_overview | 2/2 | openai/gpt-oss-120b@groq#1 | 6481 |
| L4 | lookup | How many walk-ins did we get? | PASS | found 125 ≈ 125 | get_overview | 4/4 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5112 |
| L5 | lookup | Which target version is in force right now and what's the visitor goal? | PASS | mentions /revised/i · found 2,200 ≈ 2200 | get_overview | 3/3 | openai/gpt-oss-120b@groq#1 | 5758 |
| C1 | calculation | What percentage of the registration goal have we reached? | PASS | found 73.0% ≈ 73.03 | get_overview | 7/7 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5540 |
| C2 | calculation | How many registrations per day do we need from now to hit the goal? | PASS | found 78.5 ≈ 78.45 | get_overview, propose_task | 8/8 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 12553 |
| C3 | calculation | What's our overall cost per registration to date? | PASS | found ₹106.2 ≈ 106.18 | list_campaigns, calculate, calculate, calculate | 6/6 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1, openai/gpt-oss-20b@groq#1 | 13130 |
| C4 | calculation | What was the show-up rate of confirmed registrants? | PASS | found 77 % ≈ 77 | get_funnel | 3/3 | openai/gpt-oss-120b@groq#1 | 8828 |
| P1 | comparison | Compare Paid Social and College Partnerships on cost per registration over the last 14 days. | PASS | found ₹256.00 ≈ 256 · found ₹48.61 ≈ 48.61 | list_campaigns | 9/9 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 3034 |
| P2 | comparison | Which campaign has brought the most registrations? | PASS | mentions Paid Social · found 636 ≈ 636 | list_campaigns | 4/5 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 7631 |
| P3 | comparison | Which campaign has the lowest click-through rate? | PASS | mentions Paid Social | list_campaigns | 5/5 | openai/gpt-oss-120b@groq#1 | 6085 |
| D1 | diagnosis | Where's our biggest funnel bottleneck? | PASS | mentions /identified.*regist/i · found 70.4% ≈ 70.39 | get_bottleneck | 14/14 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 11041 |
| D2 | diagnosis | How did registrations change week over week? | PASS | found 350 ≈ 350 · found 336 ≈ 336 | get_trends | 8/8 | openai/gpt-oss-120b@groq#1 | 3044 |
| D3 | diagnosis | Are we on track for the stretch target? | PASS | found 2,066.7 ≈ 2066.7 / expected ≈ 3077.14; saw 2,066.7, 2,200, 133.3, 2,066.7, 2,200, 1,836.9, 70.4%, 88.9% | get_overview | 15/17 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5999 |
| R1 | recommendation | Which campaign should we cut? | PASS | mentions Paid Social · called get_rule_evaluations | get_rule_evaluations | 10/16 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 12353 |
| R2 | recommendation | Where should we move budget, and how much? | PASS | called suggest_reallocation · found ₹16,800 ≈ 16800 | get_rule_evaluations, get_overview, list_campaigns, suggest_reallocation, propose_task | 12/12 | openai/gpt-oss-120b@groq#1, openai/gpt-oss-20b@groq#1, openai/gpt-oss-120b@groq#2, qwen/qwen3.8-27b@groq#2 | 13226 |
| R3 | recommendation | What if show-up drops to 60%? How many visitors would we get? | PASS | called run_scenario · found 1,530.8 ≈ 1530.79 | run_scenario | 10/14 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 4129 |
| F1 | follow-up | What's Paid Social's cost per registration over the last 14 days? → And Creator Partners? | PASS | found ₹134.07 ≈ 134.07 | get_campaign | 2/4 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 3223 |
| F2 | follow-up | Which campaign has the lowest cost per registration in the last 14 days? → Who owns it? | PASS | mentions Nisha Rao |  | 0/0 | qwen/qwen3.8-27b@groq#1 | 2098 |
| A1 | action | Create a task for Arjun Verma to pause Paid Social, due 3 April 2025. | PASS | proposed (not created) | get_campaign, propose_task | 2/2 | openai/gpt-oss-120b@groq#1 | 8384 |
| A2 | action | Pause the Paid Social campaign. | PASS | called propose_campaign_update | get_rule_evaluations, propose_campaign_update | 2/2 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1, openai/gpt-oss-20b@groq#1 | 11748 |
| U1 | unanswerable | What was our Instagram CTR in 2023? | PASS | states the data cannot answer | get_data_coverage | 0/0 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5458 |
| U2 | unanswerable | What was the average age of our attendees? | PASS | states the data cannot answer | get_data_coverage | 1/1 | openai/gpt-oss-120b@groq#1, openai/gpt-oss-20b@groq#1 | 5884 |
| U3 | unanswerable | How much ticket revenue did the festival make? | PASS | states the data cannot answer | get_data_coverage | 0/1 | openai/gpt-oss-120b@groq#1 | 6733 |
| U4 | unanswerable | Why exactly did people cancel their registrations? | PASS | states the data cannot answer | get_data_coverage | 0/0 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5246 |
| M1 | ambiguous | How is the partners campaign doing? | FAIL | did not disambiguate Creator Partners vs College Partnerships | get_campaign | 14/16 | openai/gpt-oss-120b@groq#1 | 11327 |
| Q1 | data quality | How many duplicate check-in records were removed, and how many denied check-ins were excluded? | PASS | found 20 ≈ 20 · found 50 ≈ 50 | get_data_coverage, propose_task | 4/4 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 8545 |
| Q2 | data quality | How many internal, staff or test people were excluded from the counts? | PASS | found 60 ≈ 60 | get_data_coverage | 11/13 | qwen/qwen3.8-27b@groq#1 | 13359 |
| X1 | after data change | What's Community Groups' cost per registration over the last 14 days? | PASS | found ₹103.1 ≈ 103.13 | get_campaign | 4/4 | openai/gpt-oss-120b@groq#1 | 9518 |
