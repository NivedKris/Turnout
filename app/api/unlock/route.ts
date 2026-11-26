import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

async function digest(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`turnout:${s}`));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const pass = process.env.APP_PASSCODE ?? "";
  const form = await req.formData();
  const given = String(form.get("passcode") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const a = Buffer.from(given);
  const b = Buffer.from(pass);
  if (!pass || (a.length === b.length && timingSafeEqual(a, b))) {
    const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
    if (pass) res.cookies.set("tn_pass", await digest(pass), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
    return res;
  }
  return NextResponse.redirect(new URL(`/unlock?error=1&next=${encodeURIComponent(safeNext)}`, req.url), 303);
}
