/**
 * Brand and contact details, as the rest of the site consumes them.
 *
 * The values themselves live in `./launch.ts` alongside a record of whether
 * anybody has verified them. This module is the flat, convenient shape — and
 * the place the production gate fires, because every page imports it.
 *
 * assertProductionReady() throws during a production build while any contact
 * detail is still the mockup placeholder. That is intentional: a storefront
 * whose every CTA points at an invented number should not be capable of
 * deploying. Local and preview builds are unaffected.
 */
import { assertProductionReady, contact, claims, publishedValue } from "./launch.ts";

assertProductionReady();

export const site = {
  name: "Take More",
  legalName: contact.legalName.value,
  city: "Cape Town",
  country: "South Africa",
  domain: contact.domain.value,

  phone: contact.phone.value,
  whatsapp: contact.whatsapp.value,
  email: contact.email.value,
  address: contact.address.value,
  hours: contact.hours.value,

  registrationNumber: contact.registrationNumber.value,
  informationOfficer: contact.informationOfficer.value,
} as const;

export const whatsappLink = (message: string) =>
  `https://wa.me/${site.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

/**
 * Marketing claims that are withheld until verified, for the handful of places
 * that render them as prose rather than as a stat tile. Null means "we have not
 * checked this", and the copy around it has to cope — see /about, where the
 * sentence is rewritten rather than left with a gap in it.
 */
export const savingRange = () => publishedValue(claims.pricedBelowNewRange);
export const newLineCost = () => publishedValue(claims.newLineCost);
