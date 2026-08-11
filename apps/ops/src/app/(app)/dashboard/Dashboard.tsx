"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STATUS_LABELS, STATUS_ORDER, rands, type ItemStatus } from "@takemore/core";
import { STATUS_CLASSES } from "@takemore/ui";
import { BreakdownChart, CostChart, DemandChart, TrendChart } from "./charts";
import {
  PERIODS,
  byMonth,
  costs,
  demand,
  group,
  groupLevel,
  summarise,
  summariseCrm,
  type Filters,
  type ItemRow,
  type LeadRow,
  type Metric,
} from "./metrics";

/**
 * The Dashboard.
 *
 * One destination in place of Today, Board and Money, because those were three
 * screens answering one question badly between them and nobody scaling this
 * business opens a tab called "Board" to find out whether refrigeration is
 * rotating.
 *
 * ── Why everything is computed in the browser ─────────────────────────────
 *
 * The server sends every machine and every recorded want once. Changing a
 * filter is then a re-render, not a round trip, which is what makes drilling
 * from a category into a subcategory feel like turning a dial rather than
 * loading a page. See metrics.ts for the arithmetic and for the one rule the
 * whole page obeys.
 *
 * ── Real time ─────────────────────────────────────────────────────────────
 *
 * router.refresh() re-runs the server component and streams new data into the
 * existing tree — no navigation, no scroll jump, and the filters keep their
 * state. It fires on a slow interval and whenever the tab regains focus, which
 * covers the case that actually matters: this is left open on a second monitor
 * all day while somebody else is publishing stock and taking enquiries off the
 * website.
 */

const REFRESH_MS = 60_000;

function useLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    // Refreshing a hidden tab spends a database query on nobody. The visibility
    // handler picks up everything missed the moment it is looked at again.
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
}

export type Category = { id: string; name: string };
export type Subcategory = { id: string; name: string; category_id: string };

export default function Dashboard({
  items,
  leads,
  categories,
  subcategories,
  greeting,
}: {
  items: ItemRow[];
  leads: LeadRow[];
  categories: Category[];
  subcategories: Subcategory[];
  greeting: string;
}) {
  useLiveRefresh();

  const [days, setDays] = useState<number | null>(365);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("margin");

  const filters: Filters = useMemo(
    () => ({ categoryId, subcategoryId, days }),
    [categoryId, subcategoryId, days]
  );

  const summary = useMemo(() => summarise(items, filters), [items, filters]);
  const groups = useMemo(() => group(items, filters), [items, filters]);
  const months = useMemo(() => byMonth(items, filters), [items, filters]);
  const costRows = useMemo(() => costs(items, filters), [items, filters]);
  const crm = useMemo(() => summariseCrm(leads, filters), [leads, filters]);
  const demandRows = useMemo(() => demand(leads, filters), [leads, filters]);
  const level = groupLevel(filters);

  // Only the chosen category's children, so the second dropdown can never offer
  // a subcategory that would produce an empty page.
  const subcategoryOptions = useMemo(
    () =>
      categoryId ? subcategories.filter((sub) => sub.category_id === categoryId) : [],
    [categoryId, subcategories]
  );

  const stages = useMemo(() => {
    const counts = new Map<ItemStatus, number>();
    for (const item of items) {
      if (item.is_sold) continue;
      counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    }
    return STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  }, [items]);

  const period = PERIODS.find((p) => p.days === days)!;
  const scopeLabel = [
    categoryId ? categories.find((c) => c.id === categoryId)?.name : null,
    subcategoryId ? subcategoryOptions.find((s) => s.id === subcategoryId)?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="max-w-6xl">
      <header className="mb-5">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">{greeting}</h1>
        <p className="text-sm font-light text-muted mt-1">
          {scopeLabel || "Everything"} · {period.label.toLowerCase()}
        </p>
      </header>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div
          role="group"
          aria-label="Period"
          className="flex rounded-xl border border-border overflow-hidden"
        >
          {PERIODS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setDays(option.days)}
              aria-pressed={option.days === days}
              className={`px-3 py-2 text-xs font-light transition-colors ${
                option.days === days
                  ? "bg-accent text-background font-medium"
                  : "text-muted hover:text-white hover:bg-white/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Select
          label="Category"
          value={categoryId}
          onChange={(value) => {
            setCategoryId(value);
            // A subcategory belongs to exactly one parent, so keeping it while
            // the parent changes would filter to nothing and look like no data.
            setSubcategoryId(null);
          }}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          allLabel="All categories"
        />

        <Select
          label="Subcategory"
          value={subcategoryId}
          onChange={setSubcategoryId}
          options={subcategoryOptions.map((s) => ({ value: s.id, label: s.name }))}
          allLabel={categoryId ? "All subcategories" : "Pick a category first"}
          disabled={!categoryId}
        />

        {(categoryId || days !== 365) && (
          <button
            type="button"
            onClick={() => {
              setCategoryId(null);
              setSubcategoryId(null);
              setDays(365);
            }}
            className="text-xs font-light text-muted hover:text-white transition-colors px-2 py-2"
          >
            Reset
          </button>
        )}

        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-light text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Live
        </span>
      </div>

      {/* ── The numbers ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Tile
          label="Margin earned"
          value={rands(summary.marginCents)}
          note={
            summary.unitsSold === 0
              ? "nothing sold in this period"
              : `${summary.unitsSold} sold${
                  summary.marginPercent === null ? "" : ` · ${summary.marginPercent}% of revenue`
                }`
          }
          accent
        />
        <Tile
          label="Rotation"
          value={summary.avgDaysToSale === null ? "—" : `${summary.avgDaysToSale} days`}
          note={
            summary.sellThroughPercent === null
              ? "arrival to sold"
              : `arrival to sold · ${summary.sellThroughPercent}% sell-through`
          }
        />
        {/* Labelled "now" on purpose: this one number ignores the period, and
            the label is the only thing standing between that and a reader who
            assumes otherwise. */}
        <Tile
          label="Tied up now"
          value={rands(summary.tiedUpCents)}
          note={`${summary.unitsOnHand} on the floor${
            summary.avgDaysOnShelf === null ? "" : ` · ${summary.avgDaysOnShelf} days avg`
          }`}
        />
        <Tile
          label="Spent"
          value={rands(summary.costCents)}
          note={`across ${summary.unitsTakenIn} machine${
            summary.unitsTakenIn === 1 ? "" : "s"
          } taken in`}
        />
      </div>

      {/* The number that grows quietly while every other number looks fine. */}
      {summary.agedUnits > 0 && (
        <div className="bg-card border border-status-sold/30 rounded-2xl p-4 flex items-start gap-3 mb-3">
          <span className="w-8 h-8 shrink-0 rounded-xl bg-status-sold/10 border border-status-sold/30 flex items-center justify-center text-status-sold">
            <iconify-icon icon="solar:hourglass-line-linear" width="16" height="16" noobserver="" />
          </span>
          <div>
            <p className="text-sm font-medium tracking-tight">
              {rands(summary.agedCents)} sitting in {summary.agedUnits} machine
              {summary.agedUnits === 1 ? "" : "s"} over 90 days old
            </p>
            <p className="text-xs font-light text-muted mt-0.5">
              Capital that is not working. Worth a price review, a photo refresh,
              or a push to the people who asked for one.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <BreakdownChart data={groups} metric={metric} onMetric={setMetric} level={level} />
        <TrendChart data={months} />
        <CostChart data={costRows} />

        {/* The table the charts are obliged to have: every number above,
            legible without colour, and the one place all four metrics sit
            side by side for the same row. */}
        {groups.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-medium tracking-tight capitalize">
                Every {level}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-muted">
                    <th scope="col" className="text-left font-medium px-4 py-3 capitalize">
                      {level}
                    </th>
                    <th scope="col" className="text-right font-medium px-4 py-3">Sold</th>
                    <th scope="col" className="text-right font-medium px-4 py-3">On hand</th>
                    <th scope="col" className="text-right font-medium px-4 py-3">Days</th>
                    <th scope="col" className="text-right font-medium px-4 py-3">Margin</th>
                    <th scope="col" className="text-right font-medium px-4 py-3">Tied up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {groups
                    .slice()
                    .sort((a, b) => b.marginCents - a.marginCents)
                    .map((row) => (
                      <tr key={row.key}>
                        <th scope="row" className="px-4 py-3 font-light text-left">
                          {row.label}
                        </th>
                        <td className="px-4 py-3 text-right font-light tabular-nums">
                          {row.unitsSold}
                        </td>
                        <td className="px-4 py-3 text-right font-light tabular-nums">
                          {row.unitsOnHand}
                        </td>
                        <td className="px-4 py-3 text-right font-light tabular-nums">
                          {row.avgDaysToSale ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span
                            className={`font-medium tabular-nums ${
                              row.marginCents >= 0 ? "text-accent" : "text-status-sold"
                            }`}
                          >
                            {rands(row.marginCents)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-light tabular-nums whitespace-nowrap">
                          {rands(row.tiedUpCents)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Clients ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          <Tile
            label={categoryId ? "Waiting for this" : "Clients"}
            value={String(crm.clients)}
            note={`${crm.newInPeriod} new in this period`}
          />
          <Tile
            label="Have bought"
            value={String(crm.customers)}
            note={
              crm.conversionPercent === null
                ? "no clients yet"
                : `${crm.conversionPercent}% of them`
            }
            accent
          />
          <Tile
            label="Wants on record"
            value={String(crm.openWants)}
            note="what to look for at auction"
          />
          <Tile
            label="Contactable"
            value={String(crm.contactable)}
            note="consented and not unsubscribed"
          />
        </div>

        <DemandChart data={demandRows} level={level} />

        {/* ── Where everything is ──────────────────────────────────────── */}
        {/* The Board's whole contribution, in one row. Tapping through opens the
            board itself, which is still where a machine gets moved. */}
        <Link
          href="/board"
          className="bg-card border border-border rounded-2xl p-5 hover:border-white/15 transition-colors"
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-medium tracking-tight">Where everything is</h2>
              <p className="text-xs font-light text-muted mt-0.5">
                Unsold stock by workshop stage. Open the board to move a machine.
              </p>
            </div>
            <iconify-icon
              icon="solar:arrow-right-linear"
              width="18"
              height="18"
              noobserver=""
              className="text-muted shrink-0"
            />
          </div>
          <ul className="space-y-2">
            {stages.map(({ status, count }) => (
              <li key={status} className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CLASSES[status].dot}`}
                />
                <span className="text-sm font-light text-white/80">
                  {STATUS_LABELS[status]}
                </span>
                <span className="flex-1 h-px bg-white/5" />
                <span className="text-sm font-light tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </Link>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{label}</p>
      <p
        className={`text-2xl font-light tracking-tighter tabular-nums ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </p>
      {note && <p className="text-[11px] font-light text-muted mt-1">{note}</p>}
    </div>
  );
}

/**
 * A native select, on purpose.
 *
 * This is opened on a phone in a warehouse as often as on a desk, and the
 * platform's own picker is a full-screen wheel with a thumb-sized hit area that
 * no custom dropdown here would beat.
 */
function Select({
  label,
  value,
  onChange,
  options,
  allLabel,
  disabled = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        className="appearance-none bg-card border border-border rounded-xl pl-3 pr-8 py-2 text-xs font-light
                   text-white/85 hover:border-white/25 focus:outline-none focus:border-accent/50
                   disabled:opacity-40 disabled:hover:border-border transition-colors"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted flex items-center">
        <iconify-icon icon="solar:alt-arrow-down-linear" width="14" height="14" noobserver="" />
      </span>
    </label>
  );
}
