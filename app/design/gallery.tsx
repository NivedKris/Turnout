"use client";

import DecryptedText from "@/components/reactbits/DecryptedText";
import DotGrid from "@/components/reactbits/DotGrid";
import LatticeLoader from "@/components/reactbits/LatticeLoader";
import Scanner from "@/components/reactbits/Scanner";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import StatusMark from "@/components/reactbits/StatusMark";
import { BootScreen } from "@/components/brand/BootScreen";
import { TurnoutMark, Wordmark } from "@/components/brand/Logo";
import { DotBars, DotFunnel, TickerTape } from "@/components/matrix/charts";
import { KpiSystem } from "@/components/matrix/KpiSystem";
import { DotSparkline, GlyphIcon, LedProgress, OriginBadge, Panel, Readout, StatusPill } from "@/components/matrix/primitives";
import { TerminalChart, type ChartPoint } from "@/components/matrix/TerminalChart";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/* SAMPLE DATA, used only on this gallery page. Real screens read the analytics engine. */
const sampleSeries: ChartPoint[] = Array.from({ length: 60 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 1, 1 + i)).toISOString().slice(0, 10);
  return { day: d, value: Math.max(0, Math.round(30 + 18 * Math.sin(i / 6) + i * 0.6 + ((i * 37) % 11))) };
});
const sampleCompare = [
  { label: "Sample B", points: sampleSeries.map((p, i) => ({ day: p.day, value: Math.round(p.value * 0.55 + (i % 5)) })) },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 className="font-mono text-xs uppercase tracking-[0.24em] text-fg-3">{title}</h2>
      {children}
    </section>
  );
}

export function Gallery() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center gap-4">
        <Wordmark />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">Design system · /design</span>
        <span className="ml-auto flex items-center gap-3">
          <OriginBadge origin="simulated" />
          <span className="font-mono text-[10px] text-fg-3">All figures on this page are sample data</span>
          <ThemeToggle />
        </span>
      </header>

      <Section id="brand" title="01 · Brand">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel code="LOGO" title="Mark">
            <div className="flex items-end gap-6 text-fg">
              <TurnoutMark size={96} boot />
              <TurnoutMark size={48} />
              <TurnoutMark size={24} />
            </div>
          </Panel>
          <Panel code="WORD" title="Wordmark">
            <div className="flex h-full flex-col justify-center gap-3">
              <Wordmark />
              <span className="font-dot text-6xl font-bold tracking-[0.1em]">TURNOUT</span>
            </div>
          </Panel>
          <Panel code="CNTD" title="Split-flap countdown">
            <SplitFlapText text="T-11 DAYS" tileColor="var(--surface-2)" textColor="var(--text)" fontSize={30} intro loop={false} />
          </Panel>
        </div>
        <div className="overflow-hidden rounded-md border border-line">
          <BootScreen label="BOOT PREVIEW" />
        </div>
      </Section>

      <Section id="tokens" title="02 · Tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {["--bg", "--surface", "--surface-2", "--line", "--text", "--text-2", "--text-3"].map((t) => (
            <div key={t} className="flex flex-col gap-2">
              <div className="h-14 rounded-md border border-line" style={{ background: `var(${t})` }} />
              <code className="font-mono text-[11px] text-fg-2">{t}</code>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Panel code="DOT" title="Display · Doto ≥ 28px">
            <div className="flex flex-col gap-1">
              <span className="font-dot text-7xl font-bold leading-none">2,050</span>
              <span className="font-dot text-5xl font-bold leading-none">93.2%</span>
              <span className="font-dot text-[28px] font-bold leading-none">₹2,74,000</span>
            </div>
          </Panel>
          <Panel code="SANS" title="UI · Geist Sans">
            <p className="text-3xl font-semibold tracking-tight">Registrations are at risk.</p>
            <p className="mt-2 text-fg-2">Body copy sits at 16px with relaxed line height for long answers from the copilot.</p>
          </Panel>
          <Panel code="MONO" title="Data · Geist Mono, tabular">
            <div className="font-mono text-sm tabular">
              <Readout k="Registrations" v="2,337" sub="73.0%" />
              <Readout k="CPR" v="₹73.58" />
              <Readout k="Show-up" v="77.0%" />
            </div>
          </Panel>
        </div>
      </Section>

      <Section id="status" title="03 · Status language (no colour)">
        <div className="flex flex-wrap items-center gap-6">
          {(["solid", "half", "hollow", "dotted"] as const).map((g) => (
            <span key={g} className="flex items-center gap-2 font-mono text-xs text-fg-2">
              <GlyphIcon glyph={g} size={16} className="text-fg" /> {g}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {["on_track", "at_risk", "off_track", "achieved", "missed", "scale", "keep", "change", "stop", "insufficient_data"].map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <StatusMark status="running" label="Syncing" color="var(--text)" />
          <StatusMark status="done" label="Task done" color="var(--text)" doneColor="var(--text)" />
          <LatticeLoader label="THINKING" pattern="spiral" grid={3} shape="round" color="var(--text)" cellSize={6} gap={3} fontSize={11} />
        </div>
      </Section>

      <Section id="kpi" title="04 · KPI systems (click → terminal drill-down)">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiSystem code="REG.01" label="Registrations" value={2337} format="int" goal={3200} projected={2887} stretch={3600} status="at_risk" delta="▲ 4.2% WoW" href="#kpi" />
          <KpiSystem code="VIS.02" label="Verified visitors" value={0} format="int" goal={2200} projected={1837} status="off_track" caption="event not started" href="#kpi" />
          <KpiSystem code="IDN.03" label="Identified people" value={3320} format="int" goal={3600} projected={3947} status="on_track" delta="▲ 57/day" href="#kpi" />
          <KpiSystem code="CPR.04" label="Cost per registration" value={73.58} format="inr" status="keep" spark={sampleSeries.slice(-21).map((p) => p.value)} delta="▼ ₹3 WoW" href="#kpi" />
        </div>
      </Section>

      <Section id="chart" title="05 · Terminal chart">
        <Panel code="REG" title="Registrations · daily" meta={<span>← → to inspect · ESC to release</span>}>
          <TerminalChart
            series={sampleSeries}
            compare={sampleCompare}
            goal={2600}
            annotations={[{ day: "2025-03-15", label: "Target revised" }]}
            title="Sample"
          />
        </Panel>
      </Section>

      <Section id="funnel" title="06 · Dot funnel, dot bars, LED progress, sparkline">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel code="FNL" title="Identified funnel">
            <DotFunnel
              highlightKey="registered"
              rows={[
                { key: "identified", label: "Identified", value: 3320, conversion: null },
                { key: "engaged", label: "Engaged", value: 3021, conversion: 0.91 },
                { key: "registered", label: "Registered", value: 2337, conversion: 0.774, benchmark: 0.889 },
                { key: "confirmed", label: "Confirmed", value: 1962, conversion: 0.84, benchmark: 0.9 },
                { key: "attended", label: "Attended", value: null, conversion: null, note: "Event has not started" },
              ]}
            />
          </Panel>
          <Panel code="CPR" title="Cost per registration by campaign">
            <DotBars
              format="inr"
              data={[
                { key: "a", label: "Sample A", value: 256, glyph: <GlyphIcon glyph="hollow" size={10} /> },
                { key: "b", label: "Sample B", value: 134, glyph: <GlyphIcon glyph="hollow" size={10} /> },
                { key: "c", label: "Sample C", value: 49, glyph: <GlyphIcon glyph="solid" size={10} /> },
                { key: "d", label: "Sample D", value: 25, glyph: <GlyphIcon glyph="solid" size={10} /> },
              ]}
            />
          </Panel>
          <Panel code="LED" title="LED progress · base and stretch markers">
            <div className="flex flex-col gap-4">
              <LedProgress value={2337} projected={2887} goal={3200} stretch={3600} />
              <LedProgress value={274000} goal={300000} />
            </div>
          </Panel>
          <Panel code="SPK" title="Dot sparkline">
            <DotSparkline points={sampleSeries.map((p) => p.value)} height={48} className="text-fg" />
          </Panel>
        </div>
        <TickerTape
          items={[
            { code: "REG", value: "2,337", delta: "▲4.2%" },
            { code: "VIS", value: "0" },
            { code: "IDN", value: "3,320", delta: "▲57/d" },
            { code: "SPD", value: "₹2,48,150" },
            { code: "CPR", value: "₹73.58", delta: "▼3" },
            { code: "BTNK", value: "IDENT→REG 70.4%" },
          ]}
        />
      </Section>

      <Section id="fx" title="07 · Effects (React Bits, used sparingly)">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel code="DCR" title="Decrypted text" bodyClassName="flex items-center">
            <span className="font-mono text-lg">
              <DecryptedText text="Bottleneck: identified → registered" animateOn="view" sequential speed={25} />
            </span>
          </Panel>
          <Panel code="GRID" title="Dot grid (interactive)" bodyClassName="relative h-48 p-0">
            <DotGrid dotSize={3} gap={14} baseColor="#3a3a3a" activeColor="#ffffff" proximity={90} />
          </Panel>
          <Panel code="SCAN" title="Scanner (terminal backdrop)" bodyClassName="relative h-48 p-0 overflow-hidden">
            <Scanner opacity={0.6} color1="#1a1a1a" color2="#8a8a8a" color3="#ffffff" />
          </Panel>
        </div>
      </Section>
    </div>
  );
}
