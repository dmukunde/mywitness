"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
} from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import {
  studyProgressLabel,
  studyProgressPercent,
} from "@/lib/bible-study";
import { formatDisplayDate } from "@/lib/utils";
import type { BibleStudy, BibleStudyStatus } from "@/lib/types";

type SortKey = "next" | "recent" | "name" | "progress";
type FilterKey = "all" | BibleStudyStatus;

export default function BibleStudiesPage() {
  const { bibleStudies, people } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
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
    };
  }, [bibleStudies]);

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
    if (filter !== "all") {
      list = list.filter(({ study }) => study.status === filter);
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
      return (a.study.next_study_date || "9999").localeCompare(
        b.study.next_study_date || "9999"
      );
    });
    return list;
  }, [enriched, filter, query, sort]);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Bible Studies"
        subtitle="Active studies · Paused · Completed"
        action={
          <Link href="/bible-studies/new">
            <Button size="sm" className="bg-amber-700 hover:bg-amber-800">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <SummaryChip label="Active" value={counts.active} />
        <SummaryChip label="Paused" value={counts.paused} />
        <SummaryChip label="Completed" value={counts.completed} />
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-amber-50 px-3 py-3 text-center ring-1 ring-amber-200/70">
      <p className="text-xs font-medium text-amber-800/80">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-amber-950">
        {value}
      </p>
    </div>
  );
}

function StudyCard({ study, name }: { study: BibleStudy; name: string }) {
  const pct = studyProgressPercent(study);
  const statusKind =
    study.status === "active"
      ? "study_active"
      : study.status === "paused"
        ? "study_paused"
        : "study_completed";

  return (
    <Link href={`/bible-studies/${study.id}`}>
      <Card className="mb-2 ring-amber-100/80">
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
              {study.next_study_date
                ? `${formatDisplayDate(study.next_study_date)}${
                    study.next_study_time ? ` · ${study.next_study_time}` : ""
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
          <StatusBadge kind={statusKind} />
        </div>
      </Card>
    </Link>
  );
}
