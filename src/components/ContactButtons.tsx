"use client";

import { MessageCircle, Phone } from "lucide-react";
import { normalizeForCall, normalizeForWhatsApp } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * Call and WhatsApp for a person, using the number saved on their profile.
 * Neither needs the number to be saved in the phone's contacts: people met in
 * the field are not added to the contact book. Calling works with no internet.
 */
export function ContactButtons({
  phoneNumber,
  personName,
  className,
}: {
  phoneNumber: string | null | undefined;
  /** Used only to build a friendlier default prefilled WhatsApp message. */
  personName?: string | null;
  className?: string;
}) {
  const call = normalizeForCall(phoneNumber);
  const whatsApp = normalizeForWhatsApp(phoneNumber);

  const disabled =
    "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-100 px-4 py-3 text-base font-medium text-stone-400";
  const reason = !call.valid
    ? call.reason
    : !whatsApp.valid
      ? `WhatsApp: ${whatsApp.reason}`
      : null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="grid grid-cols-2 gap-2">
        {call.valid ? (
          <a
            href={call.telLink}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-600 bg-white px-4 py-3 text-base font-medium text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            <Phone className="h-5 w-5" />
            Call
          </a>
        ) : (
          <button type="button" disabled className={disabled}>
            <Phone className="h-5 w-5" />
            Call
          </button>
        )}
        {whatsApp.valid ? (
          <a
            href={whatsApp.waLink(personName ? `Hi ${personName}, ` : undefined)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-base font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            <MessageCircle className="h-5 w-5" />
            WhatsApp
          </a>
        ) : (
          <button type="button" disabled className={disabled}>
            <MessageCircle className="h-5 w-5" />
            WhatsApp
          </button>
        )}
      </div>
      {reason && <p className="text-xs text-stone-500">{reason}</p>}
    </div>
  );
}
