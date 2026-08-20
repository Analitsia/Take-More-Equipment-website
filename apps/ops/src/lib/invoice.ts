import "server-only";
import type { InvoiceIssuer } from "@takemore/core";

/**
 * Who is issuing the invoice.
 *
 * Every one of these is an environment variable and not a row in a table, for
 * one reason: THIS REPOSITORY IS PUBLIC. A bank account number, read out by
 * every customer who pays by EFT, is not a secret in the sense the key scanner
 * means — but it is the business's own detail, it would be in git history for
 * ever, and `CLAUDE.md` says plainly that no internal business data goes in
 * here. `BUSINESS_POSTAL_IDENTITY` in lib/email.ts set the precedent and this
 * follows it.
 *
 * The second reason is the one that took longer to see: apps/web's launch
 * manifest, where every public claim about this business is recorded alongside
 * whether anybody has verified it, is not reachable from apps/ops. lib/email.ts
 * hit exactly this and made the same trade. So the manifest cannot gate this,
 * and the gate has to be here instead — which is what `issuerFromEnv()` is.
 *
 * ── What a wrong value costs ──────────────────────────────────────────────
 *
 * Under Companies Act s32 a company's registered name and registration number
 * must appear on its business documents. `launch.ts` currently carries
 * `0000/000000/00` as the frozen placeholder and `legalName` is unverified, so
 * the failure mode here is not theoretical: without a check, the first invoice
 * this system ever issued would have gone out with a placeholder on it and
 * nobody would have noticed until a customer's bookkeeper did.
 *
 * Hence: nothing is defaulted, nothing is guessed, and an unconfigured
 * deployment refuses to issue and says which variable is missing.
 * `issue_invoice()` re-checks the same two rules in Postgres — not because this
 * is untrusted, but because a check that only exists in the caller is a check
 * that the next caller will not have.
 */

/**
 * Every variable named in full, one static read each.
 *
 * A computed lookup — indexing the environment with a variable holding the
 * name — would be half the lines and is wrong twice over. Next inlines
 * environment access by matching the literal spelled-out text, so a computed
 * lookup is not guaranteed to survive bundling; and `npm run check:launch`
 * finds undocumented variables with the same literal match. Read dynamically,
 * this whole family goes invisible to the gate whose entire job is to notice a
 * variable nobody wrote down.
 *
 * Verified rather than assumed: the gate's count stayed at 19 while these were
 * read dynamically, and moved only once they were spelled out. (It reads the
 * file as text, comments included — so an example of the pattern written into
 * a comment up here is reported as a real, undocumented variable. That is also
 * how this note came to be phrased the long way round.)
 */
const ENV = () => ({
  legal_name: process.env.BUSINESS_LEGAL_NAME,
  registration_number: process.env.BUSINESS_REGISTRATION_NUMBER,
  address: process.env.BUSINESS_TRADING_ADDRESS,
  phone: process.env.BUSINESS_PHONE,
  email: process.env.BUSINESS_EMAIL,
  bank_name: process.env.BUSINESS_BANK_NAME,
  bank_account_name: process.env.BUSINESS_BANK_ACCOUNT_NAME,
  bank_type: process.env.BUSINESS_BANK_ACCOUNT_TYPE,
  bank_number: process.env.BUSINESS_BANK_ACCOUNT_NUMBER,
  terms_days: process.env.BUSINESS_INVOICE_TERMS_DAYS,
});

const clean = (value: string | undefined): string => (value ?? "").trim();

/** CIPC form: 2026/328785/07. */
const CIPC = /^\d{4}\/\d{6}\/\d{2}$/;

export type IssuerResult =
  | { ok: true; issuer: InvoiceIssuer }
  | { ok: false; error: string };

/**
 * The banking block on the invoice.
 *
 * All four parts or none. A half-filled block — a bank name and no account
 * number — is worse than no block at all: somebody paying by EFT reads it,
 * believes they have what they need, and pays into nothing.
 */
const bankFrom = (env: ReturnType<typeof ENV>): InvoiceIssuer["bank"] => {
  const bank = {
    name: clean(env.bank_name),
    account_name: clean(env.bank_account_name),
    type: clean(env.bank_type),
    number: clean(env.bank_number),
  };
  return Object.values(bank).every(Boolean) ? bank : null;
};

export function issuerFromEnv(): IssuerResult {
  const env = ENV();
  const legal_name = clean(env.legal_name);
  const registration_number = clean(env.registration_number);
  const address = clean(env.address);

  const missing = [
    !legal_name && "BUSINESS_LEGAL_NAME",
    !registration_number && "BUSINESS_REGISTRATION_NUMBER",
    !address && "BUSINESS_TRADING_ADDRESS",
  ].filter(Boolean);

  if (missing.length > 0) {
    return {
      ok: false,
      error:
        `Invoices are not set up yet. ${missing.join(", ")} ` +
        `${missing.length === 1 ? "is" : "are"} not configured on this deployment.`,
    };
  }

  if (!CIPC.test(registration_number) || /^0{4}\/0{6}\/0{2}$/.test(registration_number)) {
    return {
      ok: false,
      error:
        "BUSINESS_REGISTRATION_NUMBER is not this company's CIPC number. " +
        "It looks like 2026/328785/07, and it has to be read off the registration certificate.",
    };
  }

  /**
   * Nothing here reads a VAT number, and `InvoiceIssuer.vat_number` is typed
   * `never` so that adding one is a compile error. Take More is not a
   * registered vendor; heading a document "tax invoice" without being one is an
   * offence under the VAT Act rather than a formatting choice, and
   * `issue_invoice()` refuses any issuer carrying the field.
   */
  return {
    ok: true,
    issuer: {
      legal_name,
      registration_number,
      address,
      phone: clean(env.phone) || null,
      email: clean(env.email) || null,
      bank: bankFrom(env),
      // Take More's own spreadsheet invoices are dated and due the same day —
      // the machine leaves when the money arrives. Zero rather than a guess at
      // thirty, which would quietly extend credit nobody agreed to give.
      terms_days: Number(clean(env.terms_days)) || 0,
    },
  };
}

/** For the order screen: can this deployment issue at all, and if not, why not. */
export const invoicingIsConfigured = (): { ok: boolean; error?: string } => {
  const result = issuerFromEnv();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
};
