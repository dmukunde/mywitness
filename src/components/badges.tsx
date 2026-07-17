import type { ReactNode } from "react";
import type { ReturnVisitStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Shared pill shell — soft, calm, high-contrast text. */
export const PILL_BASE =
  "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-tight";

/** Semantic soft palettes — meaning over decoration. */
export const SEMANTIC = {
  green: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80",
  purple: "bg-violet-100 text-violet-900 ring-1 ring-violet-200/80",
  blue: "bg-sky-100 text-sky-900 ring-1 ring-sky-200/80",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-200/80",
  red: "bg-rose-100 text-rose-800 ring-1 ring-rose-200/80",
  gold: "bg-yellow-100 text-yellow-950 ring-1 ring-yellow-300/70",
  orange: "bg-orange-100 text-orange-900 ring-1 ring-orange-200/80",
  stone: "bg-stone-100 text-stone-700 ring-1 ring-stone-200/80",
} as const;

export type SemanticTone = keyof typeof SEMANTIC;

const TOPIC_TONES: SemanticTone[] = [
  "orange",
  "blue",
  "green",
  "purple",
  "amber",
];

function hashTone(value: string): SemanticTone {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return TOPIC_TONES[h % TOPIC_TONES.length];
}

function Pill({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone: SemanticTone;
  className?: string;
}) {
  return (
    <span className={cn(PILL_BASE, SEMANTIC[tone], className)}>
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Bible references — always blue. */
export function ScriptureBadge({
  reference,
  className,
}: {
  reference: string;
  className?: string;
}) {
  const text = reference.trim();
  if (!text) return null;
  return (
    <Pill tone="blue" className={className}>
      {text}
    </Pill>
  );
}

export function ScriptureBadgeList({
  references,
  className,
}: {
  references: Array<string | null | undefined>;
  className?: string;
}) {
  const list = references.map((r) => (r || "").trim()).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {list.map((ref) => (
        <ScriptureBadge key={ref} reference={ref} />
      ))}
    </div>
  );
}

/**
 * Discussion topics — soft colored pills for quick scanning.
 * Color is deterministic from the topic text (not random).
 */
export function TopicBadge({
  topic,
  className,
  /** Force a tone (e.g. amber for “next planned topic”). */
  tone,
}: {
  topic: string;
  className?: string;
  tone?: SemanticTone;
}) {
  const text = topic.trim();
  if (!text) return null;
  return (
    <Pill tone={tone ?? hashTone(text.toLowerCase())} className={className}>
      {text}
    </Pill>
  );
}

export type VisitBadgeKind =
  | "today"
  | "overdue"
  | "upcoming"
  | "done"
  | "planned"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "demo"
  | "attention"
  | "bible_study";

const STATUS_CONFIG: Record<
  VisitBadgeKind,
  { label: string; tone: SemanticTone }
> = {
  today: { label: "Today", tone: "amber" },
  overdue: { label: "Overdue", tone: "red" },
  upcoming: { label: "Upcoming", tone: "purple" },
  done: { label: "Done", tone: "gold" },
  planned: { label: "Planned", tone: "purple" },
  completed: { label: "Completed", tone: "gold" },
  cancelled: { label: "Cancelled", tone: "stone" },
  rescheduled: { label: "Rescheduled", tone: "amber" },
  demo: { label: "Demo", tone: "stone" },
  attention: { label: "Needs attention", tone: "red" },
  bible_study: { label: "Bible Study", tone: "green" },
};

/** Return-visit / schedule / attention status. */
export function StatusBadge({
  kind,
  label,
  className,
}: {
  kind: VisitBadgeKind;
  label?: string;
  className?: string;
}) {
  const cfg = STATUS_CONFIG[kind];
  return (
    <Pill tone={cfg.tone} className={className}>
      {label ?? cfg.label}
    </Pill>
  );
}

export function statusKindFromReturnVisit(
  status: ReturnVisitStatus,
  opts?: { overdue?: boolean; isToday?: boolean }
): VisitBadgeKind {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "rescheduled") return "rescheduled";
  if (opts?.overdue) return "overdue";
  if (opts?.isToday) return "today";
  return "planned";
}

/** Soft success / milestone banner (gold). */
export function SuccessBanner({
  children,
  onDismiss,
  className,
}: {
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-yellow-50 px-4 py-3 text-sm text-yellow-950 ring-1 ring-yellow-200/80",
        className
      )}
    >
      {children}
      {onDismiss && (
        <button
          type="button"
          className="ml-2 font-medium text-amber-800 underline decoration-amber-300 underline-offset-2"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
