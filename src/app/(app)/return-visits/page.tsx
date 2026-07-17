"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "@/lib/app-context";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { formatDisplayDate, todayISO } from "@/lib/utils";
import { isBefore, parseISO } from "date-fns";
import type { ReturnVisit } from "@/lib/types";

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

  const nameFor = (rv: ReturnVisit) =>
    rv.person?.name ||
    people.find((p) => p.id === rv.person_id)?.name ||
    "Person";

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Return Visits"
        subtitle="Prepare and follow through"
      />

      <VisitSection title="Today" items={sections.todayList} nameFor={nameFor} badge="Today" badgeClass="bg-amber-100 text-amber-800" />
      <VisitSection title="Overdue" items={sections.overdue} nameFor={nameFor} badge="Overdue" badgeClass="bg-rose-100 text-rose-700" />
      <VisitSection title="Upcoming" items={sections.upcoming} nameFor={nameFor} />
      <VisitSection title="Completed" items={sections.completed} nameFor={nameFor} badge="Done" badgeClass="bg-teal-50 text-teal-800" />
    </div>
  );
}

function VisitSection({
  title,
  items,
  nameFor,
  badge,
  badgeClass,
}: {
  title: string;
  items: ReturnVisit[];
  nameFor: (rv: ReturnVisit) => string;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <section>
      <SectionTitle title={title} />
      {items.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} visits`} />
      ) : (
        <div className="space-y-2">
          {items.map((rv) => (
            <Link key={rv.id} href={`/return-visits/${rv.id}`}>
              <Card className="mb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-stone-900">{nameFor(rv)}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {formatDisplayDate(rv.scheduled_date)}
                      {rv.scheduled_time ? ` · ${rv.scheduled_time}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-stone-700">
                      {rv.next_planned_topic || rv.last_topic || "Follow-up"}
                    </p>
                    {rv.question_to_answer && (
                      <p className="mt-1 text-xs text-stone-500">
                        Q: {rv.question_to_answer}
                      </p>
                    )}
                    {rv.general_location && (
                      <p className="mt-1 text-xs text-stone-400">
                        {rv.general_location}
                      </p>
                    )}
                  </div>
                  {badge && <Badge className={badgeClass}>{badge}</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
