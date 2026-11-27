// Screenshots for the README and the paper (viewport, 2x).  node scripts/paper-shots.mjs [base]
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:3000";
const out = "docs/img";
const A = "asOf=2025-03-31";
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { sessionStorage.setItem("tn-intro", "1"); localStorage.setItem("tn-tour", "done"); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(name); };

for (const [name, path] of [["overview", `/?${A}`], ["kpi-reg", `/kpi/reg?${A}`], ["funnel", `/funnel?${A}`], ["campaigns", `/campaigns?${A}`], ["plan", `/plan?${A}`], ["bets", `/bets?${A}`], ["decisions", `/decisions?${A}`]]) {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 300_000 });
  await page.waitForTimeout(2500);
  await shot(name);
}

// Demo workflow in the copilot terminal: one conversation.
await page.goto(`${base}/terminal?${A}`, { waitUntil: "networkidle", timeout: 300_000 });
const qs = [
  ["demo-1-on-track", "Are we on track?"],
  ["demo-2-why", "Why?"],
  ["demo-3-recommend", "What should we do?"],
  ["demo-4-task", "Create a task for Arjun Verma for that, due 3 April 2025."],
  ["demo-6-unanswerable", "What was our Instagram CTR in 2023?"],
];
for (const [name, q] of qs) {
  const box = page.getByLabel("Ask the copilot").first();
  await box.fill(q);
  await box.press("Enter");
  const t0 = Date.now();
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => !document.body.innerText.includes("ANALYSING") && !document.body.innerText.includes("ROUTING"), null, { timeout: 120_000, polling: 500 }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot(name);
  console.log(`  ${Date.now() - t0}ms :: ${q}`);
}
console.log("errors:", errors.slice(0, 5));
await browser.close();
