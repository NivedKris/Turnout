/**
 * KPI "systems" registry. Each KPI has a terminal mnemonic (e.g. REG) used by the
 * tile code, the /kpi/[key] drill-down and the command bar.
 */
export type KpiKey = "reg" | "vis" | "idn" | "spd" | "cpr" | "shw" | "ctr" | "cnf";

export type KpiDef = {
  key: KpiKey;
  code: string; // tile tag
  mnemonic: string; // command-bar code
  label: string;
  format: "int" | "inr" | "pct";
  /** Additive metrics have daily + cumulative series; ratios use a rolling 7-day series. */
  kind: "additive" | "ratio";
  description: string;
};

export const KPIS: Record<KpiKey, KpiDef> = {
  reg: {
    key: "reg",
    code: "REG.01",
    mnemonic: "REG",
    label: "Registrations",
    format: "int",
    kind: "additive",
    description: "Distinct external people with a registration, by registration date.",
  },
  vis: {
    key: "vis",
    code: "VIS.02",
    mnemonic: "VIS",
    label: "Verified visitors",
    format: "int",
    kind: "additive",
    description: "Distinct external people with an admitted + verified check-in. Walk-ins included.",
  },
  idn: {
    key: "idn",
    code: "IDN.03",
    mnemonic: "IDN",
    label: "Identified people",
    format: "int",
    kind: "additive",
    description: "Distinct external people first identified, by first-seen date.",
  },
  spd: {
    key: "spd",
    code: "SPD.04",
    mnemonic: "SPD",
    label: "Net marketing spend",
    format: "inr",
    kind: "additive",
    description: "Net posted ledger spend (credits subtract), by posting date.",
  },
  cpr: {
    key: "cpr",
    code: "CPR.05",
    mnemonic: "CPR",
    label: "Cost per registration",
    format: "inr",
    kind: "ratio",
    description: "Net spend ÷ registrations. The chart shows a rolling 7-day ratio.",
  },
  shw: {
    key: "shw",
    code: "SHW.06",
    mnemonic: "SHW",
    label: "Show-up rate",
    format: "pct",
    kind: "ratio",
    description: "Registered verified visitors ÷ registrations confirmed at event start.",
  },
  ctr: {
    key: "ctr",
    code: "CTR.07",
    mnemonic: "CTR",
    label: "Click-through rate",
    format: "pct",
    kind: "ratio",
    description: "Clicks ÷ impressions (anonymous platform events). The chart shows a rolling 7-day ratio.",
  },
  cnf: {
    key: "cnf",
    code: "CNF.08",
    mnemonic: "CNF",
    label: "Confirm rate",
    format: "pct",
    kind: "ratio",
    description: "Registrations whose latest status is confirmed ÷ registrations.",
  },
};

export const KPI_ORDER: KpiKey[] = ["reg", "vis", "idn", "spd", "cpr", "shw", "ctr", "cnf"];

export function kpiByMnemonic(m: string): KpiDef | undefined {
  const u = m.trim().toUpperCase();
  return Object.values(KPIS).find((k) => k.mnemonic === u || k.key.toUpperCase() === u);
}
