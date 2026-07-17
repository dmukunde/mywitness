import type { InterestLevel } from "@/lib/types";
import { INTEREST_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const PILL_BASE =
  "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-tight";

/**
 * Interest level badges — vibrant solids for fast recognition.
 * Single source of color styles for interest across the app.
 */
export const INTEREST_BADGE_CLASS: Record<InterestLevel, string> = {
  unknown: "bg-stone-200 text-stone-700 ring-1 ring-stone-300/60",
  very_low: "bg-red-500 text-white",
  low: "bg-orange-500 text-white",
  moderate: "bg-blue-500 text-white",
  high: "bg-green-500 text-white",
  very_high: "bg-purple-500 text-white",
  bible_study: "bg-amber-400 text-stone-900",
};

export const INTEREST_LEVEL_ORDER: InterestLevel[] = [
  "unknown",
  "very_low",
  "low",
  "moderate",
  "high",
  "very_high",
  "bible_study",
];

type Props = {
  level: InterestLevel | null | undefined;
  className?: string;
  /** When true, still show Unknown for empty/null. */
  showUnknown?: boolean;
};

export function InterestBadge({
  level,
  className,
  showUnknown = false,
}: Props) {
  const resolved: InterestLevel | null =
    level && level in INTEREST_BADGE_CLASS ? level : null;

  if (!resolved) {
    if (!showUnknown) return null;
    return (
      <span
        className={cn(PILL_BASE, INTEREST_BADGE_CLASS.unknown, className)}
      >
        {INTEREST_LABELS.unknown}
      </span>
    );
  }

  return (
    <span className={cn(PILL_BASE, INTEREST_BADGE_CLASS[resolved], className)}>
      {INTEREST_LABELS[resolved]}
    </span>
  );
}
