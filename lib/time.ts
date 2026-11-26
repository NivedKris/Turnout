/**
 * IST time helpers. India has no DST, so a fixed +05:30 offset is exact.
 * A "day key" is an IST calendar day "YYYY-MM-DD". A selected as-of day means
 * the END of that day in IST (dataset rule).
 */
export const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

/** exceljs returns IST wall-clock values as if they were UTC. Convert to the real instant. */
export function istWallClockToUtc(d: Date): Date {
  return new Date(d.getTime() - IST_OFFSET_MS);
}

/** Day key from a wall-clock Date as exceljs returns it (date-only cells). */
export function dayKeyFromWallClock(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** IST calendar day of a real instant. */
export function toDayKey(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Inclusive upper bound: 23:59:59.999 IST on the given day, as a UTC instant. */
export function endOfDayIst(dayKey: string): Date {
  const startUtcOfIstDay = Date.parse(`${dayKey}T00:00:00.000Z`) - IST_OFFSET_MS;
  return new Date(startUtcOfIstDay + DAY_MS - 1);
}

/** Start of the given IST day as a UTC instant. */
export function startOfDayIst(dayKey: string): Date {
  return new Date(Date.parse(`${dayKey}T00:00:00.000Z`) - IST_OFFSET_MS);
}

export function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function isDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Human IST timestamp, e.g. "12 Apr 2025, 15:21 IST". */
export function formatIst(instant: Date): string {
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant) + " IST"
  );
}
