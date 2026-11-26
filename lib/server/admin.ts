import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";

/** Checks `Authorization: Bearer <ADMIN_TOKEN>` in constant time. */
export function isAdmin(req: Request): boolean {
  const token = env().ADMIN_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const unauthorized = () =>
  Response.json({ ok: false, error: "Unauthorized. Send Authorization: Bearer <ADMIN_TOKEN>." }, { status: 401 });
