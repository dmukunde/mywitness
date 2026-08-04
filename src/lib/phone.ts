import { parsePhoneNumberFromString } from "libphonenumber-js";

export type WhatsAppNumberResult =
  | { valid: true; e164: string; waLink: (message?: string) => string }
  | { valid: false; reason: string };

/**
 * Normalize a phone number for a WhatsApp click-to-chat link.
 * Never silently guesses — an ambiguous or invalid number comes back invalid
 * with a reason, rather than a best-effort mangled number.
 */
export function normalizeForWhatsApp(
  raw: string | null | undefined,
  defaultCountry: "UG" = "UG"
): WhatsAppNumberResult {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return { valid: false, reason: "No phone number saved." };
  }

  const phone = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!phone || !phone.isValid()) {
    return {
      valid: false,
      reason: "This number doesn't look valid — check the digits and country code.",
    };
  }

  const e164 = phone.number; // e.g. +256772123456
  const digitsOnly = e164.replace(/^\+/, "");

  return {
    valid: true,
    e164,
    waLink: (message?: string) => {
      const base = `https://wa.me/${digitsOnly}`;
      return message ? `${base}?text=${encodeURIComponent(message)}` : base;
    },
  };
}
