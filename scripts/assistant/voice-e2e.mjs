// Real browser + fake mic: start voice, send typed turns into the live session,
// check navigation, captions, cards and errors. Usage: node voice-e2e.mjs <outDir> <base>
import { chromium } from "playwright-core";
const [outDir, base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
await ctx.addInitScript(() => { try { sessionStorage.setItem("tn-intro", "1"); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${base}/?asOf=2025-03-31`, { waitUntil: "networkidle", timeout: 300_000 });
const state = () => page.evaluate(() => document.querySelector('[aria-label="Turnout assistant"]')?.innerText.replace(/\s+/g, " "));
let t0 = Date.now();
await page.getByRole("button", { name: /Talk to Turnout/ }).click();
await page.waitForFunction(() => /Listening/.test(document.querySelector('[aria-label="Turnout assistant"]')?.textContent ?? ""), null, { timeout: 20_000 });
console.log(`connected ${Date.now() - t0}ms ::`, await state());
await page.screenshot({ path: `${outDir}/voice-0-listening.png` });

const turns = [
  ["take me to paid social", (u) => /\/campaigns\/C\d+/.test(u)],
  ["are we on track for visitors?", () => true],
  ["show me the bets", (u) => u.includes("/bets")],
  ["create a task for Asha to review the creator partners budget by 5 April", () => true],
  ["no, leave it for now", () => true],
];
let i = 0;
for (const [q, check] of turns) {
  i++;
  t0 = Date.now();
  await page.evaluate((q) => {
    window.__log = [];
    window.__done = false;
    let last = "";
    window.__unsub?.();
    window.__unsub = window.__turnoutStore.subscribe(() => {
      const s = window.__turnoutStore.get();
      if (s.status !== last) { window.__log.push(s.status); last = s.status; }
      if (s.status === "listening" && window.__log.includes("thinking")) window.__done = true;
    });
    window.__liveLog = [];
    window.__turnout.say(q);
  }, q);
  await page.waitForFunction(() => window.__done, null, { timeout: 60_000, polling: 300 }).catch(() => {});
  const url = page.url();
  console.log(`T${i} ${Date.now() - t0}ms ${check(url) ? "OK" : "FAIL"} url=${url.replace(base, "")} :: ${q}`);
  console.log("   states:", await page.evaluate(() => window.__log.join(" > ")), "| msgs:", await page.evaluate(() => [...new Set(window.__liveLog)].slice(0, 12).join(" ")), "| said:", await page.evaluate(() => window.__turnoutStore.get().caption));
  await page.screenshot({ path: `${outDir}/voice-${i}.png` });
}
const cards = await page.locator(".tn-card-in").allInnerTexts();
console.log("proposals:", await page.evaluate(() => Object.values(window.__turnoutStore.get().proposals).map((p) => `${p.id} ${p.state}`)));
console.log("cards:", cards.map((c) => c.replace(/\s+/g, " ").slice(0, 140)));
console.log("errors:", errors.slice(0, 6));
await browser.close();
