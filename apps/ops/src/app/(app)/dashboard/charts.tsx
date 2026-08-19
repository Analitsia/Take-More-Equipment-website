"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rands } from "@takemore/core";
import {
  METRICS,
  type CostRow,
  type DemandRow,
  type GroupRow,
  type Metric,
  type MonthRow,
} from "./metrics";

/**
 * Every chart on the Dashboard. Columns throughout, by request and by fit —
 * each one compares magnitudes across a handful of named things, which is the
 * one job a column does better than anything else.
 *
 * ── The palette, and why it is not the brand accent ───────────────────────
 *
 * Carried over from the Money page it replaces, where both hues were run
 * through the data-viz validator against this app's own surface (#121212):
 *
 *   blue    #3987e5   counts, rotation, cost — everything that is not margin
 *   yellow  #9A9A00   margin, and units sold
 *
 * The accent this once argued against was the old yellow #D4D414, which FAILED
 * the dark-mode lightness band at L 0.842: on a near-black surface it was so
 * much brighter than any partner hue that it stopped reading as one series
 * among two and started reading as the only thing on the chart. #9A9A00 is that
 * same hue stepped down into the band. The pair scores CVD ΔE 28.0 and
 * normal-vision ΔE 29.5, both clear of the floors, and both clear 3:1 against
 * the surface.
 *
 * The accent is now the brand teal #30A8B0, and that objection no longer holds
 * — it sits at L 0.671, inside the band, next to #9A9A00's 0.664. A different
 * one replaces it: teal is 28° of hue from the blue it would have to partner,
 * and simulating deuteranopia and protanopia across the pair drops their
 * separation by roughly two thirds against what blue-and-yellow scores. The
 * margin series stays yellow because on this chart the colour's job is telling
 * two series apart, not carrying the brand. Change it and the brand arrives on
 * a chart that some readers can no longer read.
 *
 * Two hues is the whole palette, deliberately. Four charts that each invent
 * their own colours are four charts; four charts sharing two are one
 * instrument. Negative margin is the single exception, and it is ALWAYS
 * accompanied by a minus sign and a number, so it is never colour alone.
 */

const SERIES = {
  primary: "#3987e5",
  margin: "#9A9A00",
  negative: "#D47A85",
} as const;

const INK = {
  grid: "#2A2A2A",
  axis: "#888888",
  secondary: "#c9c9c4",
} as const;

/** `R42 500` is too wide for an axis tick. `R42.5k` is not. */
export const compact = (cents: number): string => {
  const value = cents / 100;
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n >= 1_000_000) return `${sign}R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${sign}R${Math.round(n / 1_000)}k`;
  return `${sign}R${Math.round(n)}`;
};

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-ZA", {
    month: "short",
    year: "2-digit",
  });

/** Category names are words. An axis tick is not a paragraph. */
const short = (label: string) => (label.length > 14 ? `${label.slice(0, 13)}…` : label);

/** One tooltip for every chart, so they read as one instrument. */
function Panel({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="bg-background border border-border rounded-xl px-3 py-2.5 shadow-lg">
      <p className="text-[11px] font-medium tracking-tight mb-1.5">{title}</p>
      <div className="flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-6 text-[11px]">
            <span className="font-light text-muted">{label}</span>
            <span className="font-light tabular-nums text-white/90">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Frame({
  title,
  caption,
  right,
  children,
}: {
  title: string;
  caption: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <figure className="bg-card border border-border rounded-2xl p-4 sm:p-5 m-0">
      <figcaption className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          <p className="text-xs font-light text-muted mt-0.5">{caption}</p>
        </div>
        {right}
      </figcaption>
      {children}
    </figure>
  );
}

/** Said in words rather than drawn as an empty grid, which reads as zero. */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-light text-muted text-center py-10 border border-dashed border-border rounded-xl">
      {children}
    </p>
  );
}

const AXIS = {
  tick: { fill: INK.axis, fontSize: 11, fontWeight: 300 },
  tickLine: false,
} as const;

// ---------------------------------------------------------------------------
// The trend
// ---------------------------------------------------------------------------

export function TrendChart({ data }: { data: MonthRow[] }) {
  return (
    <Frame
      title="Revenue and margin, by month"
      caption="What was sold in each month, and what was left after everything the workshop spent on it."
    >
      {data.length === 0 ? (
        <Empty>Nothing has sold in this period yet.</Empty>
      ) : (
        <div className="h-56 sm:h-64 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              {/* Horizontal only: vertical rules between categorical months add
                  ink and carry no information. */}
              <CartesianGrid stroke={INK.grid} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                axisLine={{ stroke: INK.grid }}
                interval="preserveStartEnd"
                minTickGap={16}
                {...AXIS}
              />
              <YAxis tickFormatter={compact} axisLine={false} width={52} {...AXIS} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as MonthRow;
                  return (
                    <Panel
                      title={monthLabel(String(label))}
                      rows={[
                        ["Sold", `${row.unitsSold}`],
                        ["Revenue", rands(row.revenueCents)],
                        ["Margin", rands(row.marginCents)],
                        ...((row.marginPercent !== null
                          ? [["Margin %", `${row.marginPercent}%`]]
                          : []) as [string, string][]),
                        ...((row.avgDaysToSale !== null
                          ? [["Avg days to sale", `${row.avgDaysToSale}`]]
                          : []) as [string, string][]),
                      ]}
                    />
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="left"
                height={28}
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span className="text-xs font-light text-muted">{value}</span>
                )}
              />
              <Bar
                dataKey="revenueCents"
                name="Revenue"
                fill={SERIES.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="marginCents"
                name="Margin"
                fill={SERIES.margin}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// The breakdown — one chart, four questions
// ---------------------------------------------------------------------------

/**
 * Margin, rotation, cost and units share a chart because they share an axis of
 * comparison: the same categories, in the same order, at the same width. Four
 * separate charts would be four scans of the same names, and the reader would
 * have to hold one in their head to compare it with the next.
 *
 * The metric switch is a real control and not a tab, because the question
 * "which category rotates fastest" and "which earns most" are asked seconds
 * apart by the same person.
 */
export function BreakdownChart({
  data,
  metric,
  onMetric,
  level,
}: {
  data: GroupRow[];
  metric: Metric;
  onMetric: (metric: Metric) => void;
  level: "category" | "subcategory";
}) {
  const spec = METRICS.find((m) => m.id === metric)!;

  // Rotation only exists for things that have sold. A category with nothing
  // sold has no honest bar to draw, so it leaves rather than showing a zero
  // that reads as "sells instantly".
  const rows =
    metric === "rotation"
      ? data.filter((row) => row.avgDaysToSale !== null)
      : metric === "cost"
        ? data.filter((row) => row.costCents > 0)
        : metric === "margin"
          ? data.filter((row) => row.unitsSold > 0)
          : data;

  const sorted = [...rows].sort((a, b) => {
    if (metric === "margin") return b.marginCents - a.marginCents;
    if (metric === "cost") return b.costCents - a.costCents;
    if (metric === "rotation") return (a.avgDaysToSale ?? 0) - (b.avgDaysToSale ?? 0);
    return b.unitsSold + b.unitsOnHand - (a.unitsSold + a.unitsOnHand);
  });

  const money = metric === "margin" || metric === "cost";

  return (
    <Frame
      title={`${spec.label} by ${level}`}
      caption={spec.caption}
      right={
        <div
          role="group"
          aria-label="Which metric to chart"
          className="flex shrink-0 rounded-xl border border-border overflow-hidden"
        >
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMetric(m.id)}
              aria-pressed={m.id === metric}
              className={`px-2.5 py-1.5 text-[11px] font-light transition-colors ${
                m.id === metric
                  ? "bg-accent text-background font-medium"
                  : "text-muted hover:text-white hover:bg-white/5"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      {sorted.length === 0 ? (
        <Empty>
          {metric === "rotation"
            ? "Nothing has sold yet, so there is no rotation to measure."
            : `No ${spec.label.toLowerCase()} recorded for this selection.`}
        </Empty>
      ) : (
        <div className="h-60 sm:h-72 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sorted}
              barGap={2}
              margin={{ top: 16, right: 4, bottom: 0, left: 4 }}
            >
              <CartesianGrid stroke={INK.grid} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="label"
                tickFormatter={short}
                axisLine={{ stroke: INK.grid }}
                interval={0}
                {...AXIS}
              />
              <YAxis
                tickFormatter={money ? compact : (v) => String(v)}
                axisLine={false}
                width={money ? 52 : 32}
                {...AXIS}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as GroupRow;
                  return (
                    <Panel
                      title={row.label}
                      rows={[
                        ["Margin earned", rands(row.marginCents)],
                        ["Sold", `${row.unitsSold}`],
                        ["Still in stock", `${row.unitsOnHand}`],
                        [
                          "Sell-through",
                          row.sellThroughPercent === null ? "—" : `${row.sellThroughPercent}%`,
                        ],
                        [
                          "Avg days to sale",
                          row.avgDaysToSale === null ? "—" : `${row.avgDaysToSale}`,
                        ],
                        ["Spent", rands(row.costCents)],
                        ["Tied up", rands(row.tiedUpCents)],
                      ]}
                    />
                  );
                }}
              />

              {metric === "units" ? (
                <>
                  <Legend
                    verticalAlign="top"
                    align="left"
                    height={28}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span className="text-xs font-light text-muted">{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="unitsSold"
                    name="Sold"
                    fill={SERIES.margin}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="unitsOnHand"
                    name="On hand"
                    fill={SERIES.primary}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </>
              ) : (
                <Bar
                  dataKey={
                    metric === "margin"
                      ? "marginCents"
                      : metric === "cost"
                        ? "costCents"
                        : "avgDaysToSale"
                  }
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                  fill={metric === "margin" ? SERIES.margin : SERIES.primary}
                >
                  {metric === "margin" &&
                    sorted.map((row) => (
                      <Cell
                        key={row.key}
                        fill={row.marginCents < 0 ? SERIES.negative : SERIES.margin}
                      />
                    ))}
                  {/* Direct labels: one series and few bars, so the number goes
                      on the mark rather than making the reader hunt an axis. */}
                  <LabelList
                    dataKey={
                      metric === "margin"
                        ? "marginCents"
                        : metric === "cost"
                          ? "costCents"
                          : "avgDaysToSale"
                    }
                    position="top"
                    offset={6}
                    formatter={(value: unknown) =>
                      money ? compact(Number(value)) : `${value}d`
                    }
                    style={{ fill: INK.secondary, fontSize: 11, fontWeight: 300 }}
                  />
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Where the money goes
// ---------------------------------------------------------------------------

export function CostChart({ data }: { data: CostRow[] }) {
  return (
    <Frame
      title="What we spend, by kind"
      caption="Every rand that went into the machines taken in during this period. The label on each column is the average per machine that carried that cost."
    >
      {data.length === 0 ? (
        <Empty>No costs recorded against machines taken in during this period.</Empty>
      ) : (
        <div className="h-56 sm:h-64 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={INK.grid} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="label"
                tickFormatter={short}
                axisLine={{ stroke: INK.grid }}
                interval={0}
                {...AXIS}
              />
              <YAxis tickFormatter={compact} axisLine={false} width={52} {...AXIS} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as CostRow;
                  return (
                    <Panel
                      title={row.label}
                      rows={[
                        ["Total spent", rands(row.totalCents)],
                        ["Average per machine", rands(row.perUnitCents)],
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="totalCents" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={44}>
                <LabelList
                  dataKey="perUnitCents"
                  position="top"
                  offset={6}
                  formatter={(value: unknown) => compact(Number(value))}
                  style={{ fill: INK.secondary, fontSize: 11, fontWeight: 300 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------

export function DemandChart({
  data,
  level,
}: {
  data: DemandRow[];
  level: "category" | "subcategory";
}) {
  return (
    <Frame
      title={`Who is waiting, by ${level}`}
      caption="People with this written down as something they want. The yellow part has already bought from us at least once."
    >
      {data.length === 0 ? (
        <Empty>No wants recorded yet. They are captured on a client&rsquo;s page.</Empty>
      ) : (
        <div className="h-52 sm:h-60 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={INK.grid} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="label"
                tickFormatter={short}
                axisLine={{ stroke: INK.grid }}
                interval={0}
                {...AXIS}
              />
              <YAxis allowDecimals={false} axisLine={false} width={32} {...AXIS} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as DemandRow;
                  return (
                    <Panel
                      title={row.label}
                      rows={[
                        ["People waiting", `${row.clients}`],
                        ["Already customers", `${row.customers}`],
                      ]}
                    />
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="left"
                height={28}
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span className="text-xs font-light text-muted">{value}</span>
                )}
              />
              <Bar
                dataKey="clients"
                name="Waiting"
                fill={SERIES.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                dataKey="customers"
                name="Have bought before"
                fill={SERIES.margin}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Frame>
  );
}
