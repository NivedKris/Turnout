import { NextResponse, type NextRequest } from "next/server";

/**
 * Shared-passcode gate for the demo (APP_PASSCODE). Unset = open.
 * Admin routes keep their own bearer token; health stays public.
 */
// PWA files (manifest, icons, service worker, offline page) must load before the passcode is entered.
const OPEN = [/^\/unlock/, /^\/api\/unlock/, /^\/api\/health/, /^\/api\/admin\//, /^\/_next\//, /^\/favicon/, /^\/icon/, /^\/apple-icon/, /^\/icons\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/offline\.html$/];

async function digest(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`turnout:${s}`));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function proxy(req: NextRequest) {
  const pass = process.env.APP_PASSCODE;
  if (!pass) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((r) => r.test(pathname))) return NextResponse.next();
  const cookie = req.cookies.get("tn_pass")?.value;
  if (cookie && cookie === (await digest(pass))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: "Passcode required. Open the app and enter the passcode." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
