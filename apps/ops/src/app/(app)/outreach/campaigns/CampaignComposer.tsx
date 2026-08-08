"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Panel, Textarea } from "@takemore/ui";
import { rands } from "@takemore/core";
import type { CampaignRow } from "@/lib/leads";
import { createCampaign, deleteCampaign, type CampaignResult } from "./actions";
import PreviewDialog from "./PreviewDialog";

/**
 * Writing and sending the newsletter.
 *
 * Three deliberate frictions. The machines are ticked from live stock rather
 * than typed, so a newsletter cannot advertise something that is not on the
 * site. Sending is a two-step — save a draft, then send it. And the send itself
 * now happens inside a preview of the actual email, because a newsletter is the
 * one action in this whole feature with no undo, and the failure it was missing
 * a guard against was never "sent twice" — that is handled atomically in SQL —
 * it was "sent once, wrong".
 */
export default function CampaignComposer({
  items,
  preselected,
  audienceCount,
  canSend,
  campaigns,
}: {
  items: { id: string; title: string; brand: string | null; list_price_cents: number | null }[];
  preselected: string[];
  audienceCount: number;
  canSend: boolean;
  campaigns: CampaignRow[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(preselected);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<{ id: string; name: string } | null>(null);

  const report = (result: CampaignResult) => {
    if (result.ok) {
      setError(null);
      setNotice(result.notice);
      router.refresh();
    } else {
      setNotice(null);
      setError(result.error);
    }
  };

  const month = new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      {(error || notice) && (
        <div
          className={`text-xs rounded-xl px-3 py-2.5 border ${
            error
              ? "text-status-sold bg-status-sold/10 border-status-sold/30"
              : "text-accent bg-accent/10 border-accent/30"
          }`}
        >
          {error ?? notice}
        </div>
      )}

      <form
        action={async (formData) => {
          setBusy("create");
          report(await createCampaign(formData));
          setBusy(null);
        }}
      >
        <Panel title="New one" subtitle={`Goes to ${audienceCount} people who opted in.`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name it" hint="Only you see this">
              <Input name="name" defaultValue={`New stock — ${month}`} />
            </Field>
            <Field label="Subject line" hint="They see this">
              <Input name="subject" defaultValue={`Just in at Take More — ${month}`} />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="A line at the top" hint="Optional — leave it and we use ours">
              <Textarea
                name="intro"
                rows={3}
                placeholder="Six machines out of the workshop this month, including two combis we have been waiting on since June."
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label={`Machines to show (${chosen.length} picked)`}>
              {items.length === 0 ? (
                <p className="text-xs font-light text-muted">
                  Nothing is for sale on the site right now.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-white/5">
                  {items.map((item) => {
                    const on = chosen.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                      >
                        <input
                          type="checkbox"
                          name="item_ids"
                          value={item.id}
                          checked={on}
                          onChange={() =>
                            setChosen((current) =>
                              on ? current.filter((id) => id !== item.id) : [...current, item.id]
                            )
                          }
                          className="w-4 h-4 shrink-0 rounded border-border bg-background accent-accent"
                        />
                        <span className="text-xs font-light text-white/85 truncate flex-1">
                          {[item.brand, item.title].filter(Boolean).join(" ")}
                        </span>
                        <span className="text-[11px] font-light text-muted shrink-0 tabular-nums">
                          {item.list_price_cents ? rands(item.list_price_cents) : "—"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>
            <p className="text-[11px] font-light text-muted mt-2">
              Everything published since the last one is ticked already. Only stock still for
              sale on the day you send actually goes out.
            </p>
          </div>

          <Button type="submit" loading={busy === "create"} className="mt-4 text-xs px-4 py-2.5">
            Save as a draft
          </Button>
        </Panel>
      </form>

      {campaigns.length > 0 && (
        <Panel title="Sent and drafts">
          <ul className="divide-y divide-white/5 -my-2">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tracking-tight truncate">{campaign.name}</p>
                  <p className="text-[11px] font-light text-muted truncate">
                    {[
                      campaign.subject,
                      `${campaign.item_ids.length} machines`,
                      campaign.sent_at
                        ? `sent to ${campaign.recipient_count ?? 0} on ${new Date(
                            campaign.sent_at
                          ).toLocaleDateString("en-ZA")}`
                        : "draft",
                    ].join(" · ")}
                  </p>
                  {campaign.error && (
                    <p className="text-[11px] font-light text-status-sold mt-0.5">
                      {campaign.error}
                    </p>
                  )}
                </div>

                {campaign.state === "draft" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      className="text-[11px] px-2 py-1.5"
                      onClick={async () => {
                        setBusy(campaign.id);
                        report(await deleteCampaign(campaign.id));
                        setBusy(null);
                      }}
                    >
                      Delete
                    </Button>
                    {/* Opens the preview rather than sending. The send button
                        lives inside it, underneath the thing it will send —
                        this action cannot be undone, and one tap is not enough
                        ceremony for that. */}
                    <Button
                      disabled={!canSend || audienceCount === 0}
                      className="text-[11px] px-3 py-1.5"
                      onClick={() => setPreviewing({ id: campaign.id, name: campaign.name })}
                    >
                      Preview &amp; send
                    </Button>
                  </div>
                ) : (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-light border shrink-0 ${
                      campaign.state === "sent"
                        ? "border-accent/40 text-accent"
                        : "border-status-sold/40 text-status-sold"
                    }`}
                  >
                    {campaign.state === "sent" ? "Sent" : campaign.state}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {previewing && (
        <PreviewDialog
          campaignId={previewing.id}
          campaignName={previewing.name}
          onClose={() => setPreviewing(null)}
          onSent={report}
        />
      )}
    </div>
  );
}
