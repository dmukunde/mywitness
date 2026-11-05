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

export type CallNumberResult =
  | { valid: true; telLink: string }
  | { valid: false; reason: string };

/**
 * The number to dial for a "Call" button. Unlike WhatsApp, a call needs no
 * account, so a number that is not a full mobile number (a landline, a short
 * number, one typed in another country's format) is still dialled, as the
 * person typed it, minus spaces and punctuation. The phone's own dialler shows
 * the number before anything is called. A number that parses cleanly is
 * written in full international form so it also works from abroad.
 */
export function normalizeForCall(
  raw: string | null | undefined,
  defaultCountry: "UG" = "UG"
): CallNumberResult {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return { valid: false, reason: "No phone number saved." };
  }

  const phone = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (phone && phone.isValid()) {
    return { valid: true, telLink: `tel:${phone.number}` };
  }

  const keepPlus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 3) {
    return {
      valid: false,
      reason: "This number doesn't look valid — check the digits.",
    };
  }
  return { valid: true, telLink: `tel:${keepPlus}${digits}` };
}
