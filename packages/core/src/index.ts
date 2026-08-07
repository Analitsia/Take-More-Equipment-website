/**
 * @takemore/core — the rules both apps obey.
 *
 * Zero runtime dependencies, and no knowledge of Supabase. Every status
 * transition, price calculation, slug rule and publish gate lives here and is
 * imported by the storefront, the ops app and the seed script alike, so the
 * website can never disagree with the ERP about what "sold" means.
 *
 * Anything that needs a database client belongs in @takemore/db instead.
 */

export * from "./catalogue.ts";
export * from "./grades.ts";
export * from "./margin.ts";
export * from "./money.ts";
export * from "./publish.ts";
export * from "./roles.ts";
export * from "./sku.ts";
export * from "./slug.ts";
export * from "./status.ts";
