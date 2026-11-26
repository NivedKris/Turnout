// First visit in a fresh browser: welcome → overview → every tour step → Help replays it.
// Usage: node scripts/onboarding-e2e.mjs <outDir> [base] [/start-path]
import { chromium } from "playwright-core";
const [outDir, base = "http://localhost:3000", start = "/?asOf=2025-03-31"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + start, { waitUntil: "networkidle", timeout: 300_000 });
await page.getByRole("dialog", { name: /Press anywhere/ }).waitFor({ timeout: 15_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/welcome.png` });
await page.mouse.click(700, 450);
await page.waitForTimeout(350);
await page.screenshot({ path: `${outDir}/welcome-fading.png` });
await page.getByRole("dialog", { name: /Press anywhere/ }).waitFor({ state: "detached", timeout: 5_000 });
console.log("welcome faded into", page.url().replace(base, ""));
const tour = page.getByRole("dialog", { name: /Tour step/ });
await tour.waitFor({ timeout: 20_000 });
let n = 0;
while (await tour.isVisible().catch(() => false)) {
  n++;
  await page.waitForTimeout(700);
  const label = await tour.getAttribute("aria-label");
  await page.screenshot({ path: `${outDir}/tour-${String(n).padStart(2, "0")}.png` });
  console.log(label);
  const next = page.getByRole("button", { name: /^(Start|Next|Finish)$/ });
  await next.click();
  if (n > 12) break;
}
console.log("flag:", await page.evaluate(() => localStorage.getItem("tn-tour")));
await page.goto(base + "/bets?asOf=2025-03-31", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("tour auto-starts again on reload:", await tour.isVisible());
await page.getByRole("button", { name: /Help/ }).click();
await tour.waitFor({ timeout: 10_000 });
console.log("Help replays tour:", await tour.isVisible(), "at", page.url().replace(base, ""));
await page.getByRole("button", { name: "Skip tour" }).click();
await page.waitForTimeout(400);
console.log("Skip closes:", !(await tour.isVisible()));
const p2 = await (await browser.newContext()).newPage();
await p2.goto(base + "/campaigns?asOf=2025-03-31", { waitUntil: "networkidle" });
console.log("deep link skips welcome:", !(await p2.getByRole("dialog", { name: /Press anywhere/ }).isVisible()));
console.log("errors:", errors.slice(0, 5));
await browser.close();
