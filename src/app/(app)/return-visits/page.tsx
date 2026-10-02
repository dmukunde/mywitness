"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { Card, EmptyState, PageHeader, Select, SectionTitle } from "@/components/ui";
import { InterestBadge } from "@/components/InterestBadge";
import { StatusBadge, SuccessBanner, TopicBadge } from "@/components/badges";
import { formatDisplayDate } from "@/lib/utils";
import type { InterestLevel, Person, ReturnVisit } from "@/lib/types";
import type { VisitBadgeKind } from "@/components/badges";

function ReturnVisitsInner() {
  const { returnVisits, people, areas, activities } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const deletedBanner =
    !dismissedBanner && searchParams.get("deleted") === "1"
      ? "Return visit deleted."
      : null;
  const [areaFilter, setAreaFilter] = useState("all");

  const personFor = (rv: ReturnVisit): Person | undefined =>
    rv.person || people.find((p) => p.id === rv.person_id);

  const sections = useMemo(() => {
    const inArea = (rv: ReturnVisit) =>
      areaFilter === "all" || personFor(rv)?.area_id === areaFilter;
    // Sections come from the shared activity states (lib/schedule.ts), so a
    // visit that's been followed up never lingers under "Overdue".
    const rvById = new Map(returnVisits.map((rv) => [rv.id, rv]));
    const pick = (state: "due" | "upcoming" | "overdue" | "completed") =>
      activities
        .filter((a) => a.event_type === "return_visit" && a.state === state)
        .map((a) => rvById.get(a.return_visit_id!))
        .filter((rv): rv is ReturnVisit => !!rv && inArea(rv));
    return {
      todayList: pick("due"),
      upcoming: pick("upcoming"),
      overdue: pick("overdue"),
      completed: pick("completed"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, returnVisits, areaFilter, people]);

  const nameFor = (rv: ReturnVisit) => personFor(rv)?.name || "Person";

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Return Visits"
        subtitle="Prepare and follow through"
      />

      {deletedBanner && (
        <SuccessBanner
          onDismiss={() => {
            setDismissedBanner(true);
            router.replace("/return-visits", { scroll: false });
          }}
        >
          {deletedBanner}
        </SuccessBanner>
      )}

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

      <VisitSection
        title="Today"
        items={sections.todayList}
        nameFor={nameFor}
        personFor={personFor}
        statusKind="today"
      />
      <VisitSection
        title="Overdue"
        items={sections.overdue}
        nameFor={nameFor}
        personFor={personFor}
        statusKind="overdue"
      />
      <VisitSection
        title="Upcoming"
        items={sections.upcoming}
        nameFor={nameFor}
        personFor={personFor}
        statusKind="upcoming"
      />
      <VisitSection
        title="Completed"
        items={sections.completed}
        nameFor={nameFor}
        personFor={personFor}
        statusKind="done"
      />
    </div>
  );
}

export default function ReturnVisitsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <ReturnVisitsInner />
    </Suspense>
  );
}

function VisitSection({
  title,
  items,
  nameFor,
  personFor,
  statusKind,
}: {
  title: string;
  items: ReturnVisit[];
  nameFor: (rv: ReturnVisit) => string;
  personFor: (rv: ReturnVisit) => Person | undefined;
  statusKind?: VisitBadgeKind;
}) {
  return (
    <section>
      <SectionTitle title={title} />
      {items.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} visits`} />
      ) : (
        <div className="space-y-2">
          {items.map((rv) => {
            const person = personFor(rv);
            const topic = rv.next_planned_topic || rv.last_topic;
            return (
              <Link key={rv.id} href={`/return-visits/${rv.id}`}>
                <Card
                  className={
                    statusKind === "overdue"
                      ? "mb-2 ring-rose-100"
                      : statusKind === "done"
                        ? "mb-2 ring-yellow-100"
                        : "mb-2 ring-violet-100/70"
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">
                        {nameFor(rv)}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {formatDisplayDate(rv.scheduled_date)}
                        {rv.scheduled_time ? ` · ${rv.scheduled_time}` : ""}
                      </p>
                      {topic && (
                        <div className="mt-2">
                          <TopicBadge
                            topic={topic}
                            tone={
                              statusKind === "upcoming" || statusKind === "today"
                                ? "amber"
                                : undefined
                            }
                          />
                        </div>
                      )}
                      {rv.question_to_answer && (
                        <p className="mt-2 text-xs text-stone-500">
                          Q: {rv.question_to_answer}
                        </p>
                      )}
                      {rv.general_location && (
                        <p className="mt-1 text-xs text-stone-400">
                          {rv.general_location}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {statusKind && <StatusBadge kind={statusKind} />}
                      <InterestBadge
                        level={person?.interest_level as InterestLevel | null}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
