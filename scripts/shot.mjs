// Screenshots for visual QA and the README.  node scripts/shot.mjs <outDir> <url> [<url>...]
import { chromium } from "playwright-core";
const [outDir, ...urls] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { sessionStorage.setItem("tn-intro", "1"); localStorage.setItem("tn-tour", "done"); } catch {} });
for (const url of urls) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "networkidle", timeout: 600_000 });
  await page.waitForTimeout(3500);
  const name = url.replace(/^https?:\/\/[^/]+\//, "").replace(/[^a-z0-9]+/gi, "_") || "root";
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`${name}.png ${Date.now() - t0}ms errors=${errors.length}`, errors.slice(0, 3));
  await page.close();
}
await browser.close();
