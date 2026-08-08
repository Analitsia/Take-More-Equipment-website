"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  birthdayThisMonth,
  formatPhone,
  normalisePhone,
  preferredChannel,
  rands,
  type LeadStatus,
} from "@takemore/core";
import type { LeadRow } from "@/lib/leads";

/**
 * The desk-work view of people.
 *
 * Filtered in memory, matching ItemsBrowser and for the same reason. The search
 * box is the important control: it matches name, business, email and — the one
 * that earns its keep — any part of a phone number in either the spelling the
 * customer uses or the canonical one, so typing the last four digits off a
 * missed call finds them.
 */

type Filter = "all" | "reachable" | "no-consent" | "birthday" | "unsubscribed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "reachable", label: "Can message" },
  { id: "no-consent", label: "Never opted in" },
  { id: "birthday", label: "Birthday this month" },
  { id: "unsubscribed", label: "Opted out" },
];

/** What they are after, in one line, for the row. */
const wantLine = (lead: LeadRow): string => {
  const active = lead.interests.filter((i) => i.active);
  if (active.length === 0) return "Nothing recorded yet";

  const first = active[0];
  const parts = [
    first.subcategory?.name ?? first.category?.name,
    first.description || null,
    first.budget_max_cents ? `up to ${rands(first.budget_max_cents)}` : null,
  ].filter(Boolean);

  const line = parts.join(" · ") || "Something unspecified";
  return active.length > 1 ? `${line}  +${active.length - 1} more` : line;
};

const sinceLabel = (iso: string | null): string => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

export default function LeadsBrowser({
  leads,
  categories,
}: {
  leads: LeadRow[];
  categories: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [categoryId, setCategoryId] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    // A search for "0821234567" and one for "+27 82 123 4567" have to find the
    // same person, so the term is normalised the same way the column is.
    const asPhone = normalisePhone(query);

    return leads.filter((lead) => {
      if (status !== "all" && lead.status !== status) return false;

      if (categoryId !== "all") {
        const wants = lead.interests.some(
          (i) => i.active && i.category_id === categoryId
        );
        if (!wants) return false;
      }

      const channel = preferredChannel({
        emailConsentAt: lead.email_consent_at,
        whatsappConsentAt: lead.whatsapp_consent_at,
        unsubscribedAt: lead.unsubscribed_at,
        email: lead.email,
        phoneE164: lead.phone_e164,
      });

      if (filter === "reachable" && !channel) return false;
      if (filter === "no-consent" && (channel || lead.unsubscribed_at)) return false;
      if (filter === "unsubscribed" && !lead.unsubscribed_at) return false;
      if (filter === "birthday" && !birthdayThisMonth(lead.birthday)) return false;

      if (!term) return true;

      // Digits-only too, so "1234" finds +27821234567 without the searcher
      // having to know how it was stored.
      const haystack = [
        lead.full_name,
        lead.business_name,
        lead.email,
        lead.phone,
        lead.phone_e164,
        lead.phone_e164?.replace(/\D/g, ""),
        asPhone,
        ...lead.interests.map((i) => i.description),
        ...lead.interests.map((i) => i.category?.name),
        ...lead.interests.map((i) => i.subcategory?.name),
        ...lead.interests.map((i) => i.item?.title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term) || (!!asPhone && haystack.includes(asPhone.toLowerCase()));
    });
  }, [leads, query, status, categoryId, filter]);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <iconify-icon
            icon="solar:magnifer-linear"
            width="16"
            height="16"
            noobserver=""
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, business, email, or the last digits of their number"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm font-light
                       text-white/90 placeholder:text-muted/60 hover:border-white/20
                       focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus | "all")}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm font-light text-white/90
                     hover:border-white/20 focus:border-accent focus:outline-none transition-colors"
        >
          <option value="all">Any stage</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm font-light text-white/90
                     hover:border-white/20 focus:border-accent focus:outline-none transition-colors"
        >
          <option value="all">Wants anything</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            onClick={() => setFilter(option.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
              filter === option.id
                ? "border-accent/70 bg-accent/10 text-accent"
                : "border-border text-white/70 hover:border-white/25"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm font-light text-muted py-10 text-center">
          {leads.length === 0
            ? "Nobody yet. They arrive from the website form, or add someone by hand."
            : "Nothing matches that."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((lead) => {
            const channel = preferredChannel({
              emailConsentAt: lead.email_consent_at,
              whatsappConsentAt: lead.whatsapp_consent_at,
              unsubscribedAt: lead.unsubscribed_at,
              email: lead.email,
              phoneE164: lead.phone_e164,
            });

            return (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="flex items-center gap-3 sm:gap-4 bg-card border border-border rounded-2xl
                             p-3 hover:border-white/15 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-background border border-border shrink-0
                                  flex items-center justify-center text-muted">
                    <iconify-icon
                      icon={
                        lead.status === "customer"
                          ? "solar:bag-check-linear"
                          : "solar:user-linear"
                      }
                      width="18"
                      height="18"
                      noobserver=""
                      className={lead.status === "customer" ? "text-accent" : ""}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium tracking-tight truncate">
                        {lead.full_name || lead.email || formatPhone(lead.phone) || "No name yet"}
                      </h3>
                      {birthdayThisMonth(lead.birthday) && (
                        <iconify-icon
                          icon="solar:cake-linear"
                          width="12"
                          height="12"
                          noobserver=""
                          className="text-accent shrink-0"
                        />
                      )}
                    </div>
                    <p className="text-[11px] font-light text-muted truncate mt-0.5">
                      {wantLine(lead)}
                    </p>
                    <p className="text-[11px] font-light text-muted/70 truncate mt-1">
                      {[
                        LEAD_SOURCE_LABELS[lead.source],
                        lead.business_name,
                        `spoke ${sinceLabel(lead.last_contacted_at)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {lead.unsubscribed_at ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-light border border-status-sold/40 text-status-sold">
                        Opted out
                      </span>
                    ) : channel ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-light border border-accent/40 text-accent">
                        {channel === "whatsapp" ? "WhatsApp" : "Email"}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-light border border-border text-muted">
                        No consent
                      </span>
                    )}
                    <span className="text-[11px] font-light text-muted">
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
