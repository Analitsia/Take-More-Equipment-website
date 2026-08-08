import Link from "next/link";
import { formatPhone } from "@takemore/core";
import type { WantingLead } from "@/lib/leads";

/**
 * Who has been waiting for one of these.
 *
 * Shown on the machine's own page, at the moment somebody is pricing it — which
 * is the moment it is most useful. Knowing three people asked for this exact
 * fryer last month is a pricing input, not just a mailing list.
 *
 * Deliberately looser than the outreach queue: no consent filter and no
 * frequency cap, because this is not a send button. It answers "who did we
 * promise to keep an eye out for", and a customer who never ticked a marketing
 * box is still somebody to phone — a call is a conversation, not direct
 * marketing by electronic communication.
 */
export default function WhoWantsThis({ leads }: { leads: WantingLead[] }) {
  if (leads.length === 0) return null;

  return (
    <section className="bg-card border border-border rounded-2xl">
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/5">
        <div>
          <h2 className="text-sm font-medium tracking-tight">
            {leads.length} {leads.length === 1 ? "person wants" : "people want"} one of these
          </h2>
          <p className="text-xs font-light text-muted mt-0.5">
            From what they told us. Phone them — that is not marketing, that is service.
          </p>
        </div>
      </header>

      <ul className="divide-y divide-white/5">
        {leads.slice(0, 8).map((lead) => (
          <li key={lead.lead_id} className="px-5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/leads/${lead.lead_id}`}
                className="text-sm font-medium tracking-tight hover:text-accent transition-colors truncate"
              >
                {lead.full_name || lead.email || formatPhone(lead.phone) || "Unnamed"}
              </Link>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="text-[11px] font-light text-muted hover:text-white transition-colors shrink-0 tabular-nums"
                >
                  {formatPhone(lead.phone)}
                </a>
              )}
            </div>
            {lead.description && (
              <p className="text-[11px] font-light text-muted mt-0.5 leading-relaxed line-clamp-2">
                “{lead.description}”
              </p>
            )}
          </li>
        ))}
      </ul>

      {leads.length > 8 && (
        <p className="px-5 py-3 text-[11px] font-light text-muted border-t border-white/5">
          and {leads.length - 8} more
        </p>
      )}
    </section>
  );
}
