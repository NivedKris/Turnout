// Asks a question, then clicks a rule card in the trace and screenshots the detail card.
import { chromium } from "playwright-core";
const [outDir, base, q] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await page.addInitScript(() => sessionStorage.setItem("tn-intro", "1"));
await page.goto(`${base}/terminal?asOf=2025-03-31`, { waitUntil: "networkidle", timeout: 600000 });
await page.getByLabel("Ask the copilot").fill(q);
await page.getByLabel("Ask the copilot").press("Enter");
await page.waitForFunction(() => !document.body.innerText.includes("ANALYSING") && !document.body.innerText.includes("ROUTING"), null, { timeout: 120000, polling: 500 });
await page.waitForTimeout(1200);
const rule = page.locator('button[aria-label^="rule C02"]').first();
await rule.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/trace-click.png` });
console.log("dialog visible:", await page.getByRole("dialog").isVisible());
await browser.close();
