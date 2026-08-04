"use client";

import { MessageCircle } from "lucide-react";
import { normalizeForWhatsApp } from "@/lib/phone";
import { cn } from "@/lib/utils";

export function WhatsAppButton({
  phoneNumber,
  message,
  personName,
  className,
}: {
  phoneNumber: string | null | undefined;
  message?: string;
  /** Used only to build a friendlier default prefilled message. */
  personName?: string | null;
  className?: string;
}) {
  const result = normalizeForWhatsApp(phoneNumber);

  if (!result.valid) {
    return (
      <div className={cn("space-y-1", className)}>
        <button
          type="button"
          disabled
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-100 px-4 py-3 text-base font-medium text-stone-400"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp
        </button>
        <p className="text-xs text-stone-500">{result.reason}</p>
      </div>
    );
  }

  const defaultMessage =
    message ?? (personName ? `Hi ${personName}, ` : undefined);

  return (
    <a
      href={result.waLink(defaultMessage)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-base font-medium text-white shadow-sm transition hover:bg-emerald-700",
        className
      )}
    >
      <MessageCircle className="h-5 w-5" />
      Message on WhatsApp
    </a>
  );
}
