// Drives the copilot terminal in a real browser: ask a question, wait for the answer, screenshot.
import { chromium } from "playwright-core";
const [outDir, base, ...questions] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => { try { sessionStorage.setItem("tn-intro", "1"); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/terminal?asOf=2025-03-31`, { waitUntil: "networkidle", timeout: 600_000 });
let i = 0;
for (const q of questions) {
  i++;
  const box = page.getByLabel("Ask the copilot").first();
  await box.fill(q);
  await box.press("Enter");
  const t0 = Date.now();
  await page.waitForFunction(() => !document.body.innerText.includes("ANALYSING") && !document.body.innerText.includes("ROUTING"), null, { timeout: 120_000, polling: 500 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/terminal-${i}.png` });
  console.log(`Q${i} ${Date.now() - t0}ms :: ${q}`);
}
console.log("page errors:", errors.slice(0, 5));
await browser.close();
