/**
 * Single source of truth for brand + contact details.
 *
 * TODO(carlo): replace the placeholder phone/email/address with the real ones
 * before this goes anywhere near a public domain.
 */
export const site = {
  name: "Take More",
  legalName: "Take More Catering Equipment (Pty) Ltd",
  city: "Cape Town",
  country: "South Africa",
  domain: "takemoreequipment.co.za",

  // --- placeholders ---
  phone: "+27 21 555 0134",
  whatsapp: "+27215550134",
  email: "sales@takemoreequipment.co.za",
  address: "Montague Gardens, Cape Town",
  hours: "Mon–Fri 08:00–17:00 · Sat 08:00–13:00",
} as const;

export const whatsappLink = (message: string) =>
  `https://wa.me/${site.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
