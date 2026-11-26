import ExcelJS from "exceljs";
import type { ZodType } from "zod";
import {
  CampaignDailyDoc,
  CampaignDoc,
  CheckinDoc,
  EventDoc,
  FieldGuideDoc,
  InteractionDoc,
  PersonDoc,
  ReadmeDoc,
  RegistrationDoc,
  RegistrationHistoryDoc,
  TargetDoc,
} from "../models/source";
import type { SourceCollection } from "../data/collections";
import { dayKeyFromWallClock, istWallClockToUtc } from "../time";

/**
 * Parses the RISA workbook into validated documents. Pure: takes bytes and returns
 * data, with no DB access. Every row goes through its Zod schema, so a malformed
 * dataset fails the import loudly instead of corrupting analytics.
 */

type Cell = string | number | boolean | Date | null;
type RawRow = Record<string, Cell>;

/** Sheet name in the workbook, target collection, schema, and which columns are IST days vs timestamps. */
const SHEETS: {
  sheet: string;
  collection: SourceCollection;
  schema: ZodType;
  dayFields?: string[];
  instantFields?: string[];
  dataset?: boolean; // carries origin/row_no metadata
}[] = [
  { sheet: "Read me", collection: "readme", schema: ReadmeDoc },
  { sheet: "Field guide", collection: "field_guide", schema: FieldGuideDoc },
  {
    sheet: "Event",
    collection: "event",
    schema: EventDoc,
    dayFields: ["history_start", "history_end"],
    instantFields: ["event_starts_at", "event_ends_at"],
    dataset: true,
  },
  { sheet: "Targets", collection: "targets", schema: TargetDoc, instantFields: ["effective_at"], dataset: true },
  {
    sheet: "Campaigns",
    collection: "campaigns",
    schema: CampaignDoc,
    instantFields: ["created_at", "planned_start_at", "planned_end_at"],
    dataset: true,
  },
  {
    sheet: "Daily Marketing",
    collection: "campaign_daily",
    schema: CampaignDailyDoc,
    dayFields: ["activity_date"],
    dataset: true,
  },
  { sheet: "People", collection: "people", schema: PersonDoc, instantFields: ["first_seen_at"], dataset: true },
  {
    sheet: "Interest and Engagement",
    collection: "interactions",
    schema: InteractionDoc,
    instantFields: ["occurred_at"],
    dataset: true,
  },
  {
    sheet: "Registrations",
    collection: "registrations",
    schema: RegistrationDoc,
    instantFields: ["registered_at"],
    dataset: true,
  },
  {
    sheet: "Registration History",
    collection: "registration_history",
    schema: RegistrationHistoryDoc,
    instantFields: ["effective_at"],
    dataset: true,
  },
  { sheet: "Check-ins", collection: "checkins", schema: CheckinDoc, instantFields: ["occurred_at"], dataset: true },
];

export type ParsedDataset = Record<SourceCollection, Record<string, unknown>[]>;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return cellValue(v.result as ExcelJS.CellValue);
  throw new Error(`Unsupported cell value: ${JSON.stringify(v)}`);
}

function readSheet(ws: ExcelJS.Worksheet): { rows: RawRow[]; rowNumbers: number[] } {
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((h) => String(h ?? "").trim());
  const rows: RawRow[] = [];
  const rowNumbers: number[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const values = row.values as ExcelJS.CellValue[];
    const obj: RawRow = {};
    header.forEach((h, i) => {
      if (h) obj[h] = cellValue(values[i + 1]);
    });
    if (Object.values(obj).every((v) => v === null)) return;
    rows.push(obj);
    rowNumbers.push(n);
  });
  return { rows, rowNumbers };
}

export async function parseWorkbook(bytes: ArrayBuffer): Promise<ParsedDataset> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const out = {} as ParsedDataset;

  for (const spec of SHEETS) {
    const ws = wb.getWorksheet(spec.sheet);
    if (!ws) throw new Error(`Workbook is missing sheet "${spec.sheet}"`);
    const { rows, rowNumbers } = readSheet(ws);

    out[spec.collection] = rows.map((raw, i) => {
      const r: Record<string, unknown> = { ...raw };
      for (const f of spec.dayFields ?? []) {
        if (r[f] instanceof Date) r[f] = dayKeyFromWallClock(r[f] as Date);
      }
      for (const f of spec.instantFields ?? []) {
        if (r[f] instanceof Date) r[f] = istWallClockToUtc(r[f] as Date);
      }
      if (spec.dataset) {
        r.origin = "dataset";
        r.row_no = rowNumbers[i];
      }
      const parsed = spec.schema.safeParse(r);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(
          `Sheet "${spec.sheet}" row ${rowNumbers[i]}: ${issue?.path.join(".")} ${issue?.message}`,
        );
      }
      return parsed.data as Record<string, unknown>;
    });
  }
  return out;
}
