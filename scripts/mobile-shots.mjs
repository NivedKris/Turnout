// Phone-width audit: screenshots every screen at 390×844 and reports horizontal overflow.
// node scripts/mobile-shots.mjs <outDir> [base]
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
const [out, base = "http://localhost:3005"] = process.argv.slice(2);
const A = "asOf=2025-03-31";
const pages = [["overview", `/?${A}`], ["kpi", `/kpi/reg?${A}`], ["funnel", `/funnel?${A}`], ["campaigns", `/campaigns?${A}`], ["campaign", `/campaigns/C02?${A}`], ["plan", `/plan?${A}`], ["bets", `/bets?${A}`], ["bet", `/bets/B1?${A}`], ["planner", `/planner?${A}`], ["decisions", `/decisions?${A}`], ["tasks", `/tasks?${A}`], ["team", `/team?${A}`], ["terminal", `/terminal?${A}`], ["activity", `/activity?${A}`], ["settings", `/settings?${A}`]];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (process.env.APP_PASSCODE) {
  const v = createHash("sha256").update(`turnout:${process.env.APP_PASSCODE}`).digest("hex");
  await ctx.addCookies([{ name: "tn_pass", value: v, url: base }]);
}
await ctx.addInitScript(() => { sessionStorage.setItem("tn-intro", "1"); localStorage.setItem("tn-tour", "done"); });
const p = await ctx.newPage();
for (const [name, path] of pages) {
  await p.goto(base + path, { waitUntil: "networkidle", timeout: 300000 });
  await p.waitForTimeout(1200);
  const o = await p.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= W + 1) return false;
      // ignore things inside an intentional horizontal scroller
      for (let q = el.parentElement; q; q = q.parentElement) { const s = getComputedStyle(q); if (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden") return false; }
      return true;
    });
    const top = wide.filter((el) => !wide.includes(el.parentElement)).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(el.getBoundingClientRect().right)}px)`);
    window.scrollTo(600, 0);
    const sx = window.scrollX;
    window.scrollTo(0, 0);
    return { scrollW: W + sx, W, top };
  });
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log(name.padEnd(10), o.scrollW > o.W ? `OVERFLOW ${o.scrollW}>${o.W}` : "ok", o.top.join(" | "));
}
await b.close();
