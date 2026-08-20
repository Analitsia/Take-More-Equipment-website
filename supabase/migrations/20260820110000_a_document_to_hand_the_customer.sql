-- An invoice, and the proforma that comes before it.
--
-- The last thing on the ROADMAP's "Later, not started" list that a customer
-- ever sees: something to hand over. Until now a sale ended with a figure typed
-- into a screen and a card slip, and the customer walked out with nothing that
-- had the machines, the price or the business's registration number on it.
--
-- ── Why a snapshot and not a view ─────────────────────────────────────────
--
-- Everything on an invoice already exists in `orders` and `order_lines`, so the
-- obvious shape is a view and a renderer. That shape is wrong, and for exactly
-- the reason `order_lines.list_price_cents` is a stored column rather than a
-- join to `items`: the customer is holding a piece of paper. Rename a machine,
-- correct a phone number, move premises, and a re-rendered invoice stops
-- matching the one that was handed over — silently, and only visibly to the
-- person you least want to find it.
--
-- So `document` is the whole invoice as it was issued, frozen. Re-rendering
-- reads it and nothing else. There is no UPDATE policy on this table and no
-- DELETE policy, which is the same posture `lead_events` takes and for the same
-- reason: correcting a document that has left the building is not an edit, it
-- is a second document that says so.
--
-- Note the contrast with `order_economics`, three migrations back, which reads
-- costs LIVE and says in its own comment that a stored copy could disagree with
-- its own ledger. Both are right. An internal cost figure must agree with the
-- ledger it comes from; an external document must agree with the paper the
-- customer has. They pull in opposite directions and get opposite treatment.
--
-- ── The word "Tax Invoice" is not available ───────────────────────────────
--
-- In South Africa only a registered VAT vendor may issue a document headed
-- "tax invoice" (VAT Act 89 of 1991, s20), and issuing one without being
-- registered is an offence rather than a formatting mistake. Take More is not
-- registered — `ROADMAP.md` has VAT under "Later" — so every document this
-- table produces is headed "Invoice", carries no VAT line and no VAT number.
--
-- That is enforced below rather than commented: issue_invoice() refuses an
-- issuer that carries a `vat_number` at all. The day the business registers,
-- somebody will put the number in the environment, this will stop them, and
-- they will be made to do VAT properly — recalculating the sales already
-- recorded, which ROADMAP.md already warns is more work than it looks —
-- instead of quietly shipping an illegal document.


-- ---------------------------------------------------------------------------
-- Where the customer's post goes
-- ---------------------------------------------------------------------------
-- `leads` has a phone and an email because that is all it took to sell
-- somebody a fryer. An invoice addressed to a business needs the address that
-- business puts on its own paperwork, which is not the delivery address — a
-- restaurant group takes delivery at the branch and is invoiced at head office.
--
-- Nullable, and never required: the counter must not become a form. An invoice
-- with no customer address is still a valid invoice; it is only the customer's
-- own bookkeeping that suffers, and that is their call to make.
alter table public.leads add column if not exists billing_address text;

comment on column public.leads.billing_address is
  'Where this customer is invoiced, which is not orders.delivery_address — a '
  'group takes delivery at a branch and is billed at head office.';


-- ---------------------------------------------------------------------------
-- Document numbers
-- ---------------------------------------------------------------------------
-- Two sequences, not one. A proforma and an invoice are different documents
-- doing different jobs — one asks for money, one records that it arrived — and
-- an accountant reading a gap in the invoice run should not have to be told
-- that the missing numbers were quotes.
--
-- INVOICES START AT 15, AND THAT IS A FACT ABOUT THE BUSINESS, NOT A DEFAULT.
-- Take More issued INV-0001 to INV-0014 by hand from a spreadsheet before this
-- table existed. Starting at 1 would mint a second INV-0014 for a different
-- customer and a different amount, and the two would be indistinguishable in a
-- year. If more were sent from the spreadsheet after this migration was
-- written, this is the one number in the file that has to move — and it must
-- move before the first invoice is issued, because a sequence that has been
-- used cannot be rewound past what it has already handed out.
create sequence if not exists app.invoice_number_seq  as bigint start 15;
create sequence if not exists app.proforma_number_seq as bigint start 1;

create or replace function app.next_document_number(p_kind text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select case p_kind
    when 'invoice'  then 'INV-' || lpad(nextval('app.invoice_number_seq')::text,  4, '0')
    when 'proforma' then 'PRO-' || lpad(nextval('app.proforma_number_seq')::text, 4, '0')
  end
$$;

grant execute on function app.next_document_number(text) to authenticated;

comment on function app.next_document_number(text) is
  'INV-0015 or PRO-0001. Sequential and gapless-ish — a rolled-back '
  'transaction burns a number, which is normal and preferable to two documents '
  'sharing one.';


-- ---------------------------------------------------------------------------
-- order_invoices
-- ---------------------------------------------------------------------------
create table public.order_invoices (
  id uuid primary key default gen_random_uuid(),

  -- CASCADE, which looks wrong on a financial document until you check what
  -- can actually reach it. discardOrder() is the only ordinary caller that
  -- deletes an order, and it refuses anything with a `sold_by` — so the only
  -- document this can ever take with it is a proforma on a draft that was never
  -- paid, which is a quote that came to nothing. A paid order is voided, never
  -- deleted, and voiding leaves both the order and its invoice standing.
  --
  -- RESTRICT was the alternative and is worse: it would turn "the customer
  -- changed their mind" into an error message about a foreign key, and the
  -- workaround people would find is to stop issuing proformas.
  order_id uuid not null references public.orders (id) on delete cascade,

  -- Text with a CHECK rather than an enum, matching delivery_km_source. An enum
  -- would need its own migration file to ever grow — see the note at the top of
  -- 20260819100100 — and there is no ordering to exploit here.
  kind text not null check (kind in ('proforma', 'invoice')),

  number text not null unique,

  -- THE INVOICE. Everything printed on it, as it was at the moment it was
  -- issued: the customer's details, the machines, the figures, the delivery,
  -- and the issuing business's own identity and banking. Rendering reads this
  -- and joins to nothing.
  document jsonb not null,

  -- Pulled out of the document so the total can be constrained, indexed and
  -- reconciled without unpacking jsonb. Cross-checked against the document by
  -- issue_invoice() before the row is written.
  total_cents bigint not null check (total_cents >= 0),

  -- The authorisation for the public link, and the reason a customer's name,
  -- address and purchases are not sitting behind a guessable URL. 122 bits of
  -- randomness, the same mechanism and the same reasoning as
  -- leads.unsubscribe_token — POPIA does not care that a URL is unlisted, it
  -- cares that it is not enumerable.
  share_token uuid not null default gen_random_uuid() unique,

  -- The correction chain. A reopened and re-confirmed order issues a SECOND
  -- invoice rather than editing the first, and this is the link that lets the
  -- new one say which document it replaces. Same principle as the note
  -- reopen_order() writes onto the customer's timeline: the wrong one is
  -- explained, never hidden.
  supersedes uuid references public.order_invoices (id) on delete set null,

  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users (id) on delete set null
);

comment on table public.order_invoices is
  'One issued document, frozen. Never updated and never deleted — a correction '
  'is a new row pointing at the one it supersedes.';

revoke all on public.order_invoices from anon, authenticated;
alter table public.order_invoices enable row level security;

create index order_invoices_order_idx  on public.order_invoices (order_id, issued_at desc);
create index order_invoices_issued_idx on public.order_invoices (issued_at desc);

-- Read: any staff member, like every other order surface.
create policy "staff read invoices"
on public.order_invoices for select to authenticated
using ((select app.is_staff()));

-- No insert policy, no update policy, no delete policy, and none of them is an
-- oversight. issue_invoice() is SECURITY DEFINER and is the only way a row gets
-- here — which is what makes "every document in this table was produced by the
-- one code path that knows the rules" a property of the schema rather than a
-- convention people follow. It is the same argument confirm_order_paid() makes
-- about being the only writer of what a machine sold for.
--
-- Nothing is granted beyond select either: a grant without a policy still
-- refuses, but leaving both off says the intent once instead of twice.
grant select on public.order_invoices to authenticated;


-- ---------------------------------------------------------------------------
-- issue_invoice — put the document on the record
-- ---------------------------------------------------------------------------
-- The issuer is passed IN rather than read from a table, because the business's
-- own name, registration number, address and banking live in the ops app's
-- environment and Postgres cannot see them. THIS REPOSITORY IS PUBLIC; a bank
-- account number belongs in a Vercel environment variable, not in a seed row a
-- migration commits to GitHub for ever.
--
-- Passing it in means the caller supplies part of the document, so this
-- function checks what it is given rather than trusting it — an invoice with a
-- blank registration number is not a lesser invoice, it is a Companies Act s32
-- problem, and refusing to issue is cheaper than reissuing.
create or replace function public.issue_invoice(
  p_order_id uuid,
  p_kind     text,
  p_issuer   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order      public.orders%rowtype;
  v_lead       public.leads%rowtype;
  v_lines      jsonb;
  v_count      integer;
  v_subtotal   bigint;
  v_agreed     bigint;
  v_adjustment bigint;
  v_delivery   jsonb;
  v_fee        bigint;
  v_total      bigint;
  v_number     text;
  v_supersedes uuid;
  v_terms      integer;
  v_issued     timestamptz := now();
  v_document   jsonb;
  v_id         uuid;
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('proforma', 'invoice') then
    raise exception '% is not a kind of document this issues.', coalesce(p_kind, '(nothing)')
      using errcode = 'check_violation';
  end if;

  -- ── The issuing business ────────────────────────────────────────────────
  -- Checked before anything is read, so a misconfigured deployment fails on the
  -- configuration rather than halfway through building a document.
  if coalesce(btrim(p_issuer ->> 'legal_name'), '') = ''
     or coalesce(btrim(p_issuer ->> 'registration_number'), '') = ''
     or coalesce(btrim(p_issuer ->> 'address'), '') = '' then
    raise exception
      'The business details for the invoice are not configured. Set BUSINESS_LEGAL_NAME, BUSINESS_REGISTRATION_NUMBER and BUSINESS_TRADING_ADDRESS.'
      using errcode = 'check_violation';
  end if;

  -- CIPC form, YYYY/NNNNNN/NN. Shape only — this cannot know whether the number
  -- belongs to this company — but it catches the placeholder that ships in
  -- apps/web/src/data/launch.ts (0000/000000/00) and the half-typed one, which
  -- are the two ways this actually goes wrong.
  if p_issuer ->> 'registration_number' !~ '^[0-9]{4}/[0-9]{6}/[0-9]{2}$'
     or p_issuer ->> 'registration_number' ~ '^0{4}/0{6}/0{2}$' then
    raise exception
      'BUSINESS_REGISTRATION_NUMBER is not a CIPC registration number. It looks like 2026/328785/07, and it must be this company''s own.'
      using errcode = 'check_violation';
  end if;

  -- The tripwire. See the header: heading a document "tax invoice" without
  -- being a registered vendor is an offence, so the moment somebody tries to
  -- configure a VAT number this stops and makes VAT a piece of work rather than
  -- a field.
  if p_issuer ? 'vat_number' then
    raise exception
      'This system issues invoices, not tax invoices, and cannot show VAT. Registering for VAT means recalculating sales already recorded — do that work before setting a VAT number.'
      using errcode = 'feature_not_supported';
  end if;

  -- ── The order ───────────────────────────────────────────────────────────
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;

  if v_order.status = 'void' then
    raise exception 'This sale was cancelled. There is nothing to invoice.'
      using errcode = 'check_violation';
  end if;

  -- A proforma asks an open order's customer for money; an invoice records that
  -- it came. Neither one describes the other's state, and issuing the wrong one
  -- is how a customer ends up with a receipt for something they have not paid.
  if p_kind = 'invoice' and v_order.status <> 'paid' then
    raise exception 'Record the payment first. Until then it is a proforma, not an invoice.'
      using errcode = 'check_violation';
  end if;
  if p_kind = 'proforma' and v_order.status <> 'draft' then
    raise exception 'This order is already paid. Issue the invoice instead.'
      using errcode = 'check_violation';
  end if;

  if v_order.lead_id is null then
    raise exception 'An invoice needs somebody to be addressed to. Put the customer on the order first.'
      using errcode = 'check_violation';
  end if;

  select * into v_lead from public.leads where id = v_order.lead_id;

  -- ── The machines ────────────────────────────────────────────────────────
  -- The ASKING price per line, always, on both kinds of document — never
  -- order_lines.sold_price_cents. That column holds this machine's pro-rata
  -- share of a discounted total, and a customer who negotiated "R45 000 for the
  -- pair" did not agree to R27 000 and R18 000; they agreed to a discount. Put
  -- the split on the paper and the saving they argued for disappears into two
  -- numbers they have never seen.
  --
  -- So: list prices per line, and one discount line underneath. The arithmetic
  -- lands on the same total either way — see the check below, which proves it
  -- rather than asserting it.
  select
    jsonb_agg(
      jsonb_build_object(
        'code',        i.sku,
        'description', btrim(concat_ws(' ', i.brand, i.title)),
        'qty',         1,
        'unit_cents',  l.list_price_cents,
        'total_cents', l.list_price_cents
      )
      order by l.position, l.id
    ),
    count(*),
    coalesce(sum(l.list_price_cents), 0)
  into v_lines, v_count, v_subtotal
  from public.order_lines l
  join public.items i on i.id = l.item_id
  where l.order_id = p_order_id;

  if coalesce(v_count, 0) = 0 then
    raise exception 'There are no machines on this order to invoice.'
      using errcode = 'check_violation';
  end if;

  -- ── The figures ─────────────────────────────────────────────────────────
  -- On a paid order sold_total_cents is guaranteed by orders_paid_is_complete.
  -- On a draft it is whatever the salesperson has typed so far, and null means
  -- nothing has been agreed yet — in which case the proforma asks for the
  -- asking price, which is the honest reading of "no discount has been given".
  v_agreed     := coalesce(v_order.sold_total_cents, v_subtotal);
  v_adjustment := v_agreed - v_subtotal;
  v_fee        := v_order.delivery_fee_cents;
  v_total      := v_agreed + v_fee;

  -- Belt and braces against the one arithmetic mistake that matters. The
  -- database has already computed this total independently, as a generated
  -- column, from the same two figures — so if these disagree, one of them is
  -- reading something stale and the document must not be written either way.
  -- Only meaningful once a price has been agreed; a draft with no total has
  -- nothing to compare against.
  if v_order.sold_total_cents is not null and v_total <> v_order.charged_total_cents then
    raise exception
      'The invoice total (%) does not match what the order says the customer pays (%). Refusing to issue.',
      v_total, v_order.charged_total_cents
      using errcode = 'check_violation';
  end if;

  v_delivery := case
    when v_order.delivery then jsonb_build_object(
      'address',   v_order.delivery_address,
      'km',        v_order.delivery_km,
      'fee_cents', v_fee
    )
    else null
  end;

  -- Days to pay, from the environment, floored at zero. Take More's own
  -- spreadsheet invoices are dated and due the same day — the machine leaves
  -- when the money arrives — so nothing is the default rather than a guess at
  -- thirty days that would quietly extend credit nobody agreed to.
  v_terms := greatest(coalesce((p_issuer ->> 'terms_days')::integer, 0), 0);

  v_number := app.next_document_number(p_kind);

  select id into v_supersedes
  from public.order_invoices
  where order_id = p_order_id and kind = p_kind
  order by issued_at desc, number desc
  limit 1;

  v_document := jsonb_build_object(
    'kind',       p_kind,
    'number',     v_number,
    'issued_at',  v_issued,
    -- A paid invoice is due on the day it was paid, which is what makes the
    -- date and the due date match on a settled document. A proforma counts
    -- forward from today.
    'due_at',     case
                    when p_kind = 'invoice' then coalesce(v_order.paid_at, v_issued)
                    else v_issued + make_interval(days => v_terms)
                  end,
    'order_code', v_order.code,
    'issuer',     p_issuer,
    'customer',   jsonb_build_object(
                    'name',     v_lead.full_name,
                    'business', v_lead.business_name,
                    'phone',    v_lead.phone,
                    'email',    v_lead.email,
                    'address',  v_lead.billing_address
                  ),
    'lines',      v_lines,
    -- Whatever was scribbled on the order. This is where a hire period, a
    -- collection arrangement or "includes the stand" ends up, and it is the
    -- reason the notes field earns its place on the order screen.
    'note',       nullif(btrim(coalesce(v_order.notes, '')), ''),
    'subtotal_cents',   v_subtotal,
    -- Negative is a discount, positive is above the asking price. Both happen;
    -- PaymentPanel already labels the second one "Above asking".
    'adjustment_cents', v_adjustment,
    'delivery',         v_delivery,
    'total_cents',      v_total,
    'payment',    case
                    when v_order.status = 'paid' then jsonb_build_object(
                      'method',    v_order.payment_method,
                      'reference', v_order.payment_reference,
                      'paid_at',   v_order.paid_at
                    )
                    else null
                  end
  );

  insert into public.order_invoices (order_id, kind, number, document, total_cents, supersedes, issued_by)
  values (p_order_id, p_kind, v_number, v_document, v_total, v_supersedes, (select auth.uid()))
  returning id into v_id;

  -- On the customer's timeline, because "did they ever get an invoice" is a
  -- question somebody asks a month later and the answer should not be "check
  -- the orders screen". Not for a proforma superseded by its own invoice — that
  -- would read as two documents when the customer only ever needed the second.
  insert into public.lead_events (lead_id, kind, body, actor_id)
  values (
    v_order.lead_id,
    'note',
    v_number || ' issued for ' || v_order.code
      || ' · R' || round(v_total / 100.0)::bigint
      || case when p_kind = 'proforma' then ' · awaiting payment' else '' end,
    (select auth.uid())
  );

  return jsonb_build_object(
    'id',          v_id,
    'number',      v_number,
    'kind',        p_kind,
    'total_cents', v_total,
    'supersedes',  v_supersedes
  );
end;
$$;

revoke all on function public.issue_invoice(uuid, text, jsonb) from public, anon;
grant execute on function public.issue_invoice(uuid, text, jsonb) to authenticated;

comment on function public.issue_invoice(uuid, text, jsonb) is
  'Freezes one order into one document. The only writer of order_invoices. '
  'Refuses an unconfigured or placeholder issuer, and refuses any issuer '
  'carrying a VAT number — see the header of this migration for why.';
