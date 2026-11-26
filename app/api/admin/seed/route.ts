import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/server/admin";
import { writeDataset } from "@/lib/seed/load";
import { parseWorkbook } from "@/lib/seed/workbook";

export const maxDuration = 300;

const EXPECTED_SHA256 = "d63f3e013e9a823e28ab0a0587703b2ed4344e443ade185606c2ce3427203469";

/** Full re-import from data/original (rebuilds baseline too). Use on a fresh database. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  try {
    const bytes = await readFile(path.join(process.cwd(), "data/original/Attendee Dataset.xlsx"));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== EXPECTED_SHA256) {
      return Response.json({ ok: false, error: "Original dataset hash mismatch" }, { status: 409 });
    }
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await writeDataset(await getDb(), await parseWorkbook(ab), { sha256 });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Seed failed" }, { status: 500 });
  }
}
