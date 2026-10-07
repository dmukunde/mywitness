"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
} from "@/components/ui";
import { StatusBadge, SuccessBanner } from "@/components/badges";
import {
  studyProgressLabel,
  studyProgressPercent,
} from "@/lib/bible-study";
import { formatDisplayDate } from "@/lib/utils";
import type { ScheduledActivity } from "@/lib/schedule";
import type { BibleStudy, BibleStudyStatus } from "@/lib/types";

type SortKey = "next" | "recent" | "name" | "progress";
type FilterKey = "all" | BibleStudyStatus | "overdue";

function BibleStudiesInner() {
  const { bibleStudies, people, areas, activities } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const deletedBanner =
    !dismissedBanner && searchParams.get("deleted") === "1"
      ? "Bible study deleted."
      : null;
  // Overdue comes from the shared schedule (lib/schedule.ts): a study whose
  // appointment was held no longer counts, even if its date was never edited.
  const overdueIds = useMemo(
    () =>
      new Set(
        activities
          .filter((a) => a.event_type === "bible_study" && a.state === "overdue")
          .map((a) => a.bible_study_id!)
      ),
    [activities]
  );
  // Each study's appointment, from the same shared list Calendar and Home
  // use (an inactive study has none, whatever its raw date field says).
  const nextByStudy = useMemo(() => {
    const m = new Map<string, ScheduledActivity>();
    for (const a of activities) {
      if (a.event_type !== "bible_study" || a.state === "completed") continue;
      if (a.bible_study_id && !m.has(a.bible_study_id)) m.set(a.bible_study_id, a);
    }
    return m;
  }, [activities]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("next");

  const enriched = useMemo(() => {
    return bibleStudies.map((study) => {
      const person =
        study.person || people.find((p) => p.id === study.person_id) || null;
      return { study, person };
    });
  }, [bibleStudies, people]);

  const counts = useMemo(() => {
    return {
      active: bibleStudies.filter((s) => s.status === "active").length,
      paused: bibleStudies.filter((s) => s.status === "paused").length,
      completed: bibleStudies.filter((s) => s.status === "completed").length,
      overdue: bibleStudies.filter((s) => overdueIds.has(s.id)).length,
    };
  }, [bibleStudies, overdueIds]);

  const filtered = useMemo(() => {
    let list = enriched;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(({ study, person }) =>
        [
          person?.name,
          study.publication,
          study.current_lesson,
          study.preparation_notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (filter === "overdue") {
      list = list.filter(({ study }) => overdueIds.has(study.id));
    } else if (filter !== "all") {
      list = list.filter(({ study }) => study.status === filter);
    }
    if (areaFilter !== "all") {
      list = list.filter(({ person }) => person?.area_id === areaFilter);
    }
    list = [...list].sort((a, b) => {
      if (sort === "name") {
        return (a.person?.name || "").localeCompare(b.person?.name || "");
      }
      if (sort === "progress") {
        return (
          studyProgressPercent(b.study) - studyProgressPercent(a.study)
        );
      }
      if (sort === "recent") {
        return (b.study.last_study_date || "").localeCompare(
          a.study.last_study_date || ""
        );
      }
      return (nextByStudy.get(a.study.id)?.scheduled_date || "9999").localeCompare(
        nextByStudy.get(b.study.id)?.scheduled_date || "9999"
      );
    });
    return list;
  }, [enriched, filter, query, areaFilter, sort, overdueIds, nextByStudy]);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Bible Studies"
        subtitle="Active studies · Paused · Completed"
        accent="gold"
        action={
          <Link href="/bible-studies/new">
            <Button size="sm" className="bg-amber-700 hover:bg-amber-800">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </Link>
        }
      />

      {deletedBanner && (
        <SuccessBanner
          onDismiss={() => {
            setDismissedBanner(true);
            router.replace("/bible-studies", { scroll: false });
          }}
        >
          {deletedBanner}
        </SuccessBanner>
      )}

      <div className="grid grid-cols-4 gap-2">
        <SummaryChip label="Active" value={counts.active} />
        <SummaryChip label="Paused" value={counts.paused} />
        <SummaryChip label="Completed" value={counts.completed} />
        <SummaryChip label="Overdue" value={counts.overdue} tone="rose" />
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search student, publication, lesson…"
            className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="next">Sort: Next study</option>
            <option value="recent">Sort: Recent</option>
            <option value="name">Sort: Name</option>
            <option value="progress">Sort: Progress</option>
          </Select>
        </div>
        {areas.length > 0 && (
          <Select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="all">All areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Bible studies yet"
          description="Start one from a person, return visit, or add a new study."
          action={
            <Link href="/bible-studies/new">
              <Button className="bg-amber-700 hover:bg-amber-800">
                Add Bible Study
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(({ study, person }) => (
            <StudyCard
              key={study.id}
              study={study}
              name={person?.name || "Student"}
              overdue={overdueIds.has(study.id)}
              next={nextByStudy.get(study.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function BibleStudiesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <BibleStudiesInner />
    </Suspense>
  );
}

function SummaryChip({
  label,
  value,
  tone = "amber",
}: {
  label: string;
  value: number;
  tone?: "amber" | "rose";
}) {
  const toneClasses =
    tone === "rose"
      ? "bg-rose-50 ring-rose-200/70 text-rose-800/80 [&_.chip-value]:text-rose-950"
      : "bg-amber-50 ring-amber-200/70 text-amber-800/80 [&_.chip-value]:text-amber-950";
  return (
    <div className={`rounded-2xl px-3 py-3 text-center ring-1 ${toneClasses}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="chip-value mt-1 font-display text-xl font-semibold">
        {value}
      </p>
    </div>
  );
}

function StudyCard({
  study,
  name,
  overdue,
  next,
}: {
  study: BibleStudy;
  name: string;
  overdue: boolean;
  next: ScheduledActivity | null;
}) {
  const pct = studyProgressPercent(study);
  const statusKind =
    study.status === "active"
      ? "study_active"
      : study.status === "paused"
        ? "study_paused"
        : "study_completed";

  return (
    <Link href={`/bible-studies/${study.id}`}>
      <Card className={`mb-2 ring-amber-100/80 ${overdue ? "ring-rose-200" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-stone-900">{name}</p>
            <p className="mt-0.5 text-sm text-amber-900/80">{study.publication}</p>
            <p className="mt-2 text-sm text-stone-600">
              {study.current_lesson || "Lesson not set"}
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Last:{" "}
              {study.last_study_date
                ? formatDisplayDate(study.last_study_date)
                : "—"}
              {" · "}
              Next:{" "}
              {next
                ? `${formatDisplayDate(next.scheduled_date)}${
                    next.scheduled_time ? ` · ${next.scheduled_time}` : ""
                  }`
                : "—"}
            </p>
            {study.preparation_notes && (
              <p className="mt-2 line-clamp-2 text-xs text-stone-500">
                {study.preparation_notes}
              </p>
            )}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-stone-500">
                <span>{studyProgressLabel(study)}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge kind={statusKind} />
            {overdue && <StatusBadge kind="overdue" />}
          </div>
        </div>
      </Card>
    </Link>
  );
}
