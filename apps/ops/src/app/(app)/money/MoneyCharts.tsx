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

/**
 * The two charts on the Money page.
 *
 * ── The palette, and why it is not the brand accent ───────────────────────
 *
 * Every colour here was run through the data-viz validator against this app's
 * own surface (#121212), not chosen by eye:
 *
 *   revenue  #3987e5  blue
 *   margin   #9A9A00  a darker step of the brand yellow
 *
 * The brand accent itself (#D4D414) FAILS the dark-mode lightness band at
 * L 0.842 — on a near-black surface it is so much brighter than any partner
 * hue that it stops reading as one series among two and starts reading as the
 * only thing on the chart. #9A9A00 is the same hue stepped down into the band.
 * The pair scores CVD ΔE 28.0 and normal-vision ΔE 29.5, both far clear of the
 * floors, and both clear 3:1 against the surface.
 *
 * The accent stays the accent everywhere else in the app. This is a chart-only
 * step of it, for the same reason a print palette differs from a screen one.
 *
 * Negative margin uses the app's existing status-sold colour and is ALWAYS
 * accompanied by a minus sign and a number, so it is never colour alone.
 *
 * ── Composition ───────────────────────────────────────────────────────────
 *
 * Thin marks, 4px rounded data-ends, a 2px surface gap between adjacent bars,
 * recessive grid and axes, a legend for the two-series chart and direct labels
 * on the single-series one. No dual axis anywhere: revenue and margin are the
 * same unit on the same scale, which is the only reason they share a chart.
 */

const SERIES = {
  revenue: "#3987e5",
  margin: "#9A9A00",
  negative: "#D47A85",
} as const;

const INK = {
  surface: "#121212",
  grid: "#2A2A2A",
  axis: "#888888",
  primary: "#ffffff",
  secondary: "#c9c9c4",
} as const;

/** `R42 500` is too wide for an axis tick. `R42.5k` is not. */
const compact = (cents: number): string => {
  const value = cents / 100;
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n >= 1_000_000) return `${sign}R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${sign}R${Math.round(n / 1_000)}k`;
  return `${sign}R${Math.round(n)}`;
};

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });

export type MonthRow = {
  month: string;
  units_sold: number;
  revenue_cents: number;
  margin_cents: number;
  margin_percent: number | null;
  avg_days_to_sale: number | null;
};

export type CategoryRow = {
  category: string;
  units_total: number;
  units_sold: number;
  units_in_stock: number;
  sell_through_percent: number | null;
  margin_cents: number;
  tied_up_cents: number;
  avg_days_to_sale: number | null;
};

/** One tooltip style for both charts, so they read as one instrument. */
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

export function MonthlyChart({ data }: { data: MonthRow[] }) {
  if (data.length === 0) return null;

  // Oldest first, and only the last two years — beyond that the bars are too
  // thin to read on a phone, which is where this is opened.
  const rows = [...data].sort((a, b) => a.month.localeCompare(b.month)).slice(-24);

  return (
    <figure className="bg-card border border-border rounded-2xl p-4 sm:p-5 m-0">
      <figcaption className="mb-4">
        <h2 className="text-sm font-medium tracking-tight">Revenue and margin, by month</h2>
        <p className="text-xs font-light text-muted mt-0.5">
          What was sold in each month, and what was left after everything the
          workshop spent on it.
        </p>
      </figcaption>

      <div className="h-56 sm:h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            {/* Horizontal only: vertical rules between categorical months add
                ink and carry no information. */}
            <CartesianGrid stroke={INK.grid} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tick={{ fill: INK.axis, fontSize: 11, fontWeight: 300 }}
              tickLine={false}
              axisLine={{ stroke: INK.grid }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tickFormatter={compact}
              tick={{ fill: INK.axis, fontSize: 11, fontWeight: 300 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as MonthRow;
                return (
                  <Panel
                    title={monthLabel(String(label))}
                    rows={[
                      ["Sold", `${row.units_sold}`],
                      ["Revenue", rands(row.revenue_cents)],
                      ["Margin", rands(row.margin_cents)],
                      ...((row.margin_percent !== null
                        ? [["Margin %", `${row.margin_percent}%`]]
                        : []) as [string, string][]),
                      ...((row.avg_days_to_sale !== null
                        ? [["Avg days to sale", `${row.avg_days_to_sale}`]]
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
            <Bar dataKey="revenue_cents" name="Revenue" fill={SERIES.revenue} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="margin_cents" name="Margin" fill={SERIES.margin} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function CategoryChart({ data }: { data: CategoryRow[] }) {
  // Only categories that have actually sold something — a row of zeros tells
  // nobody anything, and the stock-side numbers are in the table below.
  const rows = data
    .filter((row) => row.units_sold > 0)
    .sort((a, b) => b.margin_cents - a.margin_cents)
    .slice(0, 8);

  if (rows.length === 0) return null;

  return (
    <figure className="bg-card border border-border rounded-2xl p-4 sm:p-5 m-0">
      <figcaption className="mb-4">
        <h2 className="text-sm font-medium tracking-tight">Margin earned, by category</h2>
        <p className="text-xs font-light text-muted mt-0.5">
          Where the money has actually come from. Sell-through and capital still
          tied up are in the table below.
        </p>
      </figcaption>

      {/* Horizontal bars: category names are words, and words belong on a
          horizontal axis where they can be read without turning your head.
          One series, so no legend — the caption names it. */}
      <div style={{ height: rows.length * 34 + 24 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 56, bottom: 0, left: 4 }}
            barCategoryGap={6}
          >
            <CartesianGrid stroke={INK.grid} horizontal={false} />
            <XAxis type="number" tickFormatter={compact} hide />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fill: INK.secondary, fontSize: 11, fontWeight: 300 }}
              tickLine={false}
              axisLine={false}
              width={104}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as CategoryRow;
                return (
                  <Panel
                    title={row.category}
                    rows={[
                      ["Margin earned", rands(row.margin_cents)],
                      ["Sold", `${row.units_sold} of ${row.units_total}`],
                      [
                        "Sell-through",
                        row.sell_through_percent === null ? "—" : `${row.sell_through_percent}%`,
                      ],
                      ["Still in stock", `${row.units_in_stock}`],
                      ["Tied up", rands(row.tied_up_cents)],
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="margin_cents" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {rows.map((row) => (
                <Cell
                  key={row.category}
                  fill={row.margin_cents < 0 ? SERIES.negative : SERIES.margin}
                />
              ))}
              {/* Direct labels: one series and few bars, so the number goes on
                  the mark rather than making the reader hunt for an axis. */}
              <LabelList
                dataKey="margin_cents"
                position="right"
                offset={8}
                formatter={(value: unknown) => compact(Number(value))}
                style={{ fill: INK.secondary, fontSize: 11, fontWeight: 300 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
