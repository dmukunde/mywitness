"use client";

import { ExternalLink } from "lucide-react";
import { scriptureLinks } from "@/lib/scripture";
import { cn } from "@/lib/utils";

/**
 * Bible references as tappable links that open the exact passage on JW.org
 * (in a new tab). A reference that can't be read confidently is shown as
 * plain text instead — never as a link that goes somewhere wrong.
 */
export function ScriptureLinks({
  references,
  className,
}: {
  references: string[];
  className?: string;
}) {
  const list = references.map((r) => r.trim()).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {list.flatMap((ref, i) => {
        const links = scriptureLinks(ref);
        if (!links) {
          return [
            <span
              key={`${i}-${ref}`}
              title="Couldn't turn this into a link"
              className="inline-flex min-h-9 items-center rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 ring-1 ring-stone-200/80"
            >
              {ref}
            </span>,
          ];
        }
        return links.map((link) => (
          <a
            key={`${i}-${link.label}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${link.label} on JW.org`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 text-sm font-semibold text-sky-900 ring-1 ring-sky-200/80 transition hover:bg-sky-200"
          >
            {link.label}
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </a>
        ));
      })}
    </div>
  );
}
