"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Select, Sheet } from "@/components/ui";
import {
  DAY_LABELS,
  DAY_SHORT,
  MINISTRY_DAYS,
  daysOf,
  toggleDay,
} from "@/lib/ministry-days";
import { formatDbError } from "@/lib/db-errors";
import { cn } from "@/lib/utils";

/**
 * "Sort into days": go down your people and tap the days you usually visit
 * each one. Each tap saves at once. People who had no day when this opened
 * stay in the list while you work, so a row doesn't jump away mid-tap.
 */
export function MinistryDaySheet({ onClose }: { onClose: () => void }) {
  const { people, areas, setMinistryDays } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  // Who had no day when the sheet opened.
  const [startedWithout] = useState(
    () => new Set(people.filter((p) => daysOf(p).length === 0).map((p) => p.id))
  );

  const rows = useMemo(() => {
    return people
      .filter((p) => (showAll ? true : startedWithout.has(p.id)))
      .filter((p) => areaFilter === "all" || p.area_id === areaFilter)
      .sort(
        (a, b) =>
          (a.area?.name ?? "~").localeCompare(b.area?.name ?? "~") ||
          a.name.localeCompare(b.name)
      );
  }, [people, showAll, startedWithout, areaFilter]);

  const tap = async (personId: string, next: ReturnType<typeof daysOf>) => {
    setError(null);
    try {
      await setMinistryDays(personId, next);
    } catch (err) {
      setError(formatDbError("save ministry days", err, "Could not save that day."));
    }
  };

  const remaining = people.filter((p) => daysOf(p).length === 0).length;

  return (
    <Sheet
      open
      title="Sort people into days"
      subtitle="Tap the days you usually visit each person. It saves as you tap, and doesn't schedule anything."
      onClose={onClose}
    >
      <Select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
        <option value="all">All areas</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-sm text-stone-600">
          {showAll || areaFilter !== "all"
            ? "No one here."
            : "Everyone has a day. Nice and tidy."}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => {
            const days = daysOf(p);
            return (
              <li key={p.id} className="rounded-2xl bg-stone-50 p-3">
                <p className="text-sm font-medium text-stone-900">
                  {p.name}
                  {p.area?.name && (
                    <span className="font-normal text-stone-500"> · {p.area.name}</span>
                  )}
                </p>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {MINISTRY_DAYS.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${DAY_LABELS[d]} for ${p.name}`}
                        onClick={() => void tap(p.id, toggleDay(days, d))}
                        className={cn(
                          "min-h-10 rounded-lg text-xs font-semibold ring-1 transition",
                          on
                            ? "bg-emerald-700 text-white ring-emerald-700"
                            : "bg-white text-stone-600 ring-stone-200"
                        )}
                      >
                        {DAY_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="w-full text-center text-xs font-medium text-emerald-800 underline decoration-emerald-200 underline-offset-2"
      >
        {showAll ? "Show only people who had no day" : "Show everyone, to change a day"}
      </button>

      <Button className="w-full" onClick={onClose}>
        {remaining > 0 ? `Done (${remaining} still without a day)` : "Done"}
      </Button>
    </Sheet>
  );
}
