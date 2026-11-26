/**
 * Tool router: picks the tools relevant to this turn so each model call stays small
 * (Groq free tier is ~8k tokens/minute). Routes on the latest two user messages so
 * follow-ups ("why?", "and last week?") inherit the previous intent.
 */
export type ToolName =
  | "get_overview"
  | "get_funnel"
  | "list_campaigns"
  | "get_campaign"
  | "compare_campaigns"
  | "get_bottleneck"
  | "get_trends"
  | "get_daily_series"
  | "get_rule_evaluations"
  | "suggest_reallocation"
  | "run_scenario"
  | "list_tasks"
  | "get_activity"
  | "get_data_coverage"
  | "calculate"
  | "propose_task"
  | "propose_campaign_update"
  | "get_goal_model"
  | "list_bets"
  | "get_bet"
  | "get_weekly_drivers"
  | "list_decisions"
  | "get_team"
  | "propose_decision"
  | "navigate"
  | "offer_navigation";

const ROUTES: { re: RegExp; tools: ToolName[] }[] = [
  { re: /take me|open (the|my)?|show me|go to|pull up|let me see|navigate|where (can|do|is|are)|how do i (get|find)/i, tools: ["navigate", "offer_navigation"] },
  { re: /\bbets?\b|strateg|initiative|experiment|idea|double down|deprioriti|rice|hypothes|signal|leading indicator|early warning/i, tools: ["list_bets", "get_bet"] },
  { re: /plan\b|goal model|how high|aim|audience|segment|potential|bottom.?up|capacity|base case|stretch case/i, tools: ["get_goal_model"] },
  { re: /decision|decided|did .* work|work(ed)?\?|outcome|result of|after we/i, tools: ["list_decisions", "get_bet", "propose_decision"] },
  { re: /what (changed|moved)|driv|this week|last week|week over week|why did/i, tools: ["get_weekly_drivers"] },
  { re: /owner|team|workload|who (owns|is responsible)|busy|overloaded/i, tools: ["get_team"] },
  { re: /on track|track|target|goal|projection|project|forecast|expect|stretch|base case|reach the|hit the|how many .*(attend|visit)|status/i, tools: ["get_overview"] },
  { re: /\bwhy\b|bottleneck|funnel|conversion|convert|drop|leak|stage|show.?up|no.?show|confirm/i, tools: ["get_bottleneck", "get_funnel"] },
  { re: /cut|stop|scale|kill|pause|should we|what should|recommend|priori|focus|double down|invest|budget|realloc|move .*(budget|money|₹)|spend more|best|worst|winner|loser|underperform|outperform/i, tools: ["get_rule_evaluations", "suggest_reallocation"] },
  { re: /what if|scenario|if we|suppose|simulate|drops? to|rises? to|increase .* by|decrease .* by/i, tools: ["run_scenario", "get_overview"] },
  { re: /campaign|channel|paid|social|ambassador|creator|partner|college|referral|organic|search|community|instagram|c0\d/i, tools: ["list_campaigns", "get_campaign"] },
  { re: /compare|versus|\bvs\b|better than|difference between/i, tools: ["compare_campaigns"] },
  { re: /trend|week|wow|last \d+ days|change|increase|decrease|grow|declin|daily|per day|on \d{1,2} (jan|feb|mar|apr)|(jan|feb|mar|apr)[a-z]* \d{1,2}/i, tools: ["get_trends", "get_daily_series"] },
  { re: /task|todo|to-do|owner|overdue|assign|deadline|action item/i, tools: ["list_tasks"] },
  { re: /create|make|add|draft|log|assign|set up|schedule|for that|do it/i, tools: ["propose_task"] },
  { re: /pause|update|threshold|set .* status|change .* budget|mark .* (stopped|paused)/i, tools: ["propose_campaign_update"] },
  { re: /changed|activity|history|yesterday|recent|who (changed|edited|updated)|audit|log/i, tools: ["get_activity"] },
  { re: /spend|cost|cpr|cpa|cpc|ctr|click|impression|session|reach|budget|₹|rupee/i, tools: ["list_campaigns"] },
];

const ALWAYS: ToolName[] = ["calculate", "get_data_coverage", "propose_task"];
const DEFAULT: ToolName[] = ["get_overview", "list_campaigns", "get_campaign"];
const MAX = 10;

export function routeTools(userTexts: string[]): ToolName[] {
  const recent = userTexts.slice(-2);
  const picked: ToolName[] = [];
  // The latest message is weighted first; the previous one fills remaining slots.
  for (const text of [...recent].reverse()) {
    for (const r of ROUTES) if (r.re.test(text)) for (const t of r.tools) if (!picked.includes(t)) picked.push(t);
  }
  const base = picked.length ? picked : DEFAULT;
  const out = [...base.slice(0, MAX - ALWAYS.length)];
  for (const t of ALWAYS) if (!out.includes(t)) out.push(t);
  // A recommendation usually needs the headline numbers too.
  if (out.includes("suggest_reallocation") && !out.includes("get_overview") && out.length < MAX) out.splice(0, 0, "get_overview");
  return out;
}
