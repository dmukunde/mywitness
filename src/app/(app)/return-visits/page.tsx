"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "@/lib/app-context";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { InterestBadge } from "@/components/InterestBadge";
import { StatusBadge, TopicBadge } from "@/components/badges";
import { formatDisplayDate, todayISO } from "@/lib/utils";
import { isBefore, parseISO } from "date-fns";
import type { InterestLevel, Person, ReturnVisit } from "@/lib/types";
import type { VisitBadgeKind } from "@/components/badges";

export default function ReturnVisitsPage() {
  const { returnVisits, people } = useApp();
  const today = todayISO();

  const sections = useMemo(() => {
    const planned = returnVisits.filter((rv) => rv.status === "planned");
    const todayList = planned.filter((rv) => rv.scheduled_date === today);
    const upcoming = planned.filter((rv) => rv.scheduled_date > today);
    const overdue = planned.filter((rv) =>
      isBefore(parseISO(rv.scheduled_date), parseISO(today))
    );
    const completed = returnVisits.filter((rv) => rv.status === "completed");
    return { todayList, upcoming, overdue, completed };
  }, [returnVisits, today]);

  const personFor = (rv: ReturnVisit): Person | undefined =>
    rv.person || people.find((p) => p.id === rv.person_id);

  const nameFor = (rv: ReturnVisit) => personFor(rv)?.name || "Person";

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Return Visits"
        subtitle="Prepare and follow through"
      />

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
