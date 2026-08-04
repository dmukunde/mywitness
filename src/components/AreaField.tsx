"use client";

import { useState } from "react";
import { MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Area } from "@/lib/types";

/**
 * Reusable area/neighbourhood selector with search, and inline "create new"
 * when nothing matches. A plain filtered list rather than a native
 * <datalist> — datalist support on mobile Safari is unreliable, and this
 * needs to work well on a phone.
 */
export function AreaField({
  label = "Area / neighbourhood",
  value,
  onChange,
  areas,
  placeholder = "Kiwatule",
  hint,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  areas: Area[];
  placeholder?: string;
  hint?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setQuery(value);
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? areas.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 6)
    : areas.slice(0, 6);
  const exactMatch = areas.some((a) => a.name.trim().toLowerCase() === q);

  return (
    <div className="relative space-y-1.5">
      {label && (
        <span className="block text-sm font-medium text-stone-700">
          {label}
        </span>
      )}
      <div className="relative">
        <MapPinned className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3.5 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </div>
      {open && (matches.length > 0 || (q && !exactMatch)) && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          {matches.map((a) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(a.name);
                setQuery(a.name);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3.5 py-2.5 text-left text-sm text-stone-800 hover:bg-stone-50"
              )}
            >
              {a.name}
            </button>
          ))}
          {q && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(query.trim());
                setOpen(false);
              }}
              className="block w-full border-t border-stone-100 px-3.5 py-2.5 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50"
            >
              + Create &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
      {hint && <span className="text-xs text-amber-700">{hint}</span>}
    </div>
  );
}
