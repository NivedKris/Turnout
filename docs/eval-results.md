# Copilot eval results

Run: 2026-11-26T14:48:20.579Z against `http://localhost:3123`. Expected values are computed by the analytics engine from the live database at run time (not hard-coded).

**Pass rate: 23/30 (76.7%)** · numeric claims grounded: 142/162 (87.7%)

| Category | Passed |
|---|---|
| lookup | 4/5 |
| calculation | 2/4 |
| comparison | 2/3 |
| diagnosis | 3/3 |
| recommendation | 2/3 |
| follow-up | 2/2 |
| action | 1/2 |
| unanswerable | 4/4 |
| ambiguous | 0/1 |
| data quality | 2/2 |
| after data change | 1/1 |

| ID | Category | Question(s) | Result | Check | Tools | Grounded | Model(s) | ms |
|---|---|---|---|---|---|---|---|---|
| L1 | lookup | How many registrations do we have so far? | PASS | found 2,337 ≈ 2337 | get_overview | 3/3 | openai/gpt-oss-120b@groq#1 | 6984 |
| L2 | lookup | What's our net marketing spend to date? | PASS | found ₹2,48,150 ≈ 248150 | list_campaigns, calculate | 9/10 | openai/gpt-oss-120b@groq#1 | 6191 |
| L3 | lookup | How many unique verified visitors attended the festival? | PASS | found 2,050 ≈ 2050 | get_overview | 3/3 | openai/gpt-oss-120b@groq#1 | 9192 |
| L4 | lookup | How many walk-ins did we get? | FAIL | expected ≈ 125; saw 2,050 | get_data_coverage, get_overview | 1/1 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 8259 |
| L5 | lookup | Which target version is in force right now and what's the visitor goal? | PASS | mentions /revised/i · found 2,200 ≈ 2200 | get_overview | 3/3 | openai/gpt-oss-120b@groq#1 | 9394 |
| C1 | calculation | What percentage of the registration goal have we reached? | PASS | found 73.0% ≈ 73.03 | get_overview, calculate | 5/5 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 4313 |
| C2 | calculation | How many registrations per day do we need from now to hit the goal? | PASS | found 78.5 ≈ 78.45 | get_overview | 14/15 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 7019 |
| C3 | calculation | What's our overall cost per registration to date? | FAIL | error: An error occurred. | list_campaigns | 0/0 | openai/gpt-oss-120b@groq#1 | 5615 |
| C4 | calculation | What was the show-up rate of confirmed registrants? | FAIL | expected ≈ 77%; saw 112.0%, 2,800, 2,500, 2,800, 2,500, 112.0%, 100% | get_funnel, calculate | 6/7 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 10818 |
| P1 | comparison | Compare Paid Social and College Partnerships on cost per registration over the last 14 days. | FAIL | expected ≈ 256; saw 14, ₹76.6, ₹135.8, ₹135.8491, 14, ₹76.5957, 14, 14 · expected ≈ 48.61; saw 14, ₹76.6, ₹135.8, ₹135.8491, 14, ₹76.5957, 14, 14 | get_campaign, get_campaign | 8/8 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1, openai/gpt-oss-20b@groq#1 | 5100 |
| P2 | comparison | Which campaign has brought the most registrations? | PASS | mentions Paid Social · found 636 ≈ 636 | list_campaigns | 2/2 | openai/gpt-oss-120b@groq#1 | 6603 |
| P3 | comparison | Which campaign has the lowest click-through rate? | PASS | mentions Paid Social | list_campaigns | 3/3 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5460 |
| D1 | diagnosis | Where's our biggest funnel bottleneck? | PASS | mentions /identified.*regist/i · found 70.4% ≈ 70.39 | get_bottleneck | 14/14 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5516 |
| D2 | diagnosis | How did registrations change week over week? | PASS | found 350 ≈ 350 · found 336 ≈ 336 | get_trends | 8/10 | openai/gpt-oss-120b@groq#1 | 6648 |
| D3 | diagnosis | Are we on track for the stretch target? | PASS | found 2,067 ≈ 2066.7 / expected ≈ 3077.14; saw 2,200, 2,067, 2,200,, 2,066.7, 84 %, 5 % | get_overview | 6/6 | openai/gpt-oss-120b@groq#1 | 5371 |
| R1 | recommendation | Which campaign should we cut? | FAIL | error: An error occurred. | get_rule_evaluations | 0/0 | openai/gpt-oss-120b@groq#1 | 9402 |
| R2 | recommendation | Where should we move budget, and how much? | PASS | called suggest_reallocation · found ₹16,800 ≈ 16800 | get_rule_evaluations, suggest_reallocation | 15/16 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 7768 |
| R3 | recommendation | What if show-up drops to 60%? How many visitors would we get? | PASS | called run_scenario · found 1,531 ≈ 1530.79 | run_scenario | 7/10 | openai/gpt-oss-120b@groq#1 | 10433 |
| F1 | follow-up | What's Paid Social's cost per registration over the last 14 days? → And Creator Partners? | PASS | found ₹134.1 ≈ 134.07 | get_campaign | 10/16 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 7962 |
| F2 | follow-up | Which campaign has the lowest cost per registration in the last 14 days? → Who owns it? | PASS | mentions Nisha Rao | get_campaign | 0/0 | openai/gpt-oss-120b@groq#1 | 12091 |
| A1 | action | Create a task for Arjun Verma to pause Paid Social, due 3 April 2025. | FAIL | error: An error occurred. |  | 0/0 | openai/gpt-oss-120b@groq#1 | 4531 |
| A2 | action | Pause the Paid Social campaign. | PASS | called propose_campaign_update | get_campaign, propose_campaign_update | 2/5 | openai/gpt-oss-120b@groq#1 | 11147 |
| U1 | unanswerable | What was our Instagram CTR in 2023? | PASS | states the data cannot answer | get_data_coverage | 0/0 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 13809 |
| U2 | unanswerable | What was the average age of our attendees? | PASS | states the data cannot answer | get_data_coverage | 0/0 | openai/gpt-oss-120b@groq#1 | 5454 |
| U3 | unanswerable | How much ticket revenue did the festival make? | PASS | states the data cannot answer | get_data_coverage | 1/1 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5015 |
| U4 | unanswerable | Why exactly did people cancel their registrations? | PASS | states the data cannot answer | get_data_coverage | 0/0 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 6874 |
| M1 | ambiguous | How is the partners campaign doing? | FAIL | did not disambiguate Creator Partners vs College Partnerships |  | 0/0 | openai/gpt-oss-120b@groq#1 | 8463 |
| Q1 | data quality | How many duplicate check-in records were removed, and how many denied check-ins were excluded? | PASS | found 20 ≈ 20 · found 50 ≈ 50 | get_data_coverage | 4/4 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 9217 |
| Q2 | data quality | How many internal, staff or test people were excluded from the counts? | PASS | found 60 ≈ 60 | get_data_coverage, calculate | 11/11 | openai/gpt-oss-120b@groq#1, qwen/qwen3.8-27b@groq#1 | 5458 |
| X1 | after data change | What's Community Groups' cost per registration over the last 14 days? | PASS | found ₹103.1 ≈ 103.13 | get_campaign | 7/9 | openai/gpt-oss-120b@groq#1 | 121350 |
