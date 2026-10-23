"use client";

import {
  DAY_LABELS,
  DAY_SHORT,
  MINISTRY_DAYS,
  toggleDay,
  type MinistryDay,
} from "@/lib/ministry-days";
import { cn } from "@/lib/utils";

/**
 * Pick the days of the week you usually visit or meet someone. Several can be
 * chosen; none is fine. This only organises People, so the hint says so.
 */
export function MinistryDayPicker({
  value,
  onChange,
}: {
  value: MinistryDay[];
  onChange: (days: MinistryDay[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-stone-700">
        Ministry days <span className="font-normal text-stone-400">(optional)</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {MINISTRY_DAYS.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={DAY_LABELS[d]}
              onClick={() => onChange(toggleDay(value, d))}
              className={cn(
                "min-h-10 min-w-[3.25rem] rounded-full px-3 text-sm font-medium ring-1 transition",
                on
                  ? "bg-emerald-700 text-white ring-emerald-700"
                  : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
              )}
            >
              {DAY_SHORT[d]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-stone-500">
        The days you usually visit or meet them. This only groups your People; it
        doesn&apos;t schedule a visit or send a reminder.
      </p>
    </div>
  );
}
