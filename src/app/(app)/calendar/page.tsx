"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { cn, formatDisplayDate, todayISO } from "@/lib/utils";
import type { ScheduledMinistryEvent } from "@/lib/types";

type Filter = "all" | "return_visit" | "bible_study";
type ViewMode = "month" | "agenda";

export default function CalendarPage() {
  const { ministryEvents, people, returnVisits, bibleStudies } = useApp();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => parseISO(today));
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay] = useState(today);

  const events = useMemo(() => {
    let list = ministryEvents.filter((e) => e.status !== "cancelled");
    // Fallback: merge from domain tables if event sync missing
    if (!list.length) {
      list = [
        ...returnVisits
          .filter((rv) => rv.status === "planned" || rv.status === "completed")
          .map(
            (rv): ScheduledMinistryEvent => ({
              id: `rv-${rv.id}`,
              user_id: rv.user_id,
              person_id: rv.person_id,
              event_type: "return_visit",
              return_visit_id: rv.id,
              bible_study_id: null,
              scheduled_date: rv.scheduled_date,
              scheduled_time: rv.scheduled_time,
              general_location: rv.general_location,
              topic_or_lesson: rv.next_planned_topic || rv.last_topic,
              preparation_notes: rv.preparation_notes,
              status: rv.status,
              is_demo: rv.is_demo,
              created_at: rv.created_at,
              updated_at: rv.updated_at,
            })
          ),
        ...bibleStudies
          .filter((s) => s.status === "active" && s.next_study_date)
          .map(
            (s): ScheduledMinistryEvent => ({
              id: `bs-${s.id}`,
              user_id: s.user_id,
              person_id: s.person_id,
              event_type: "bible_study",
              return_visit_id: null,
              bible_study_id: s.id,
              scheduled_date: s.next_study_date!,
              scheduled_time: s.next_study_time,
              general_location: s.general_location,
              topic_or_lesson: s.current_lesson,
              preparation_notes: s.preparation_notes,
              status: "planned",
              is_demo: s.is_demo,
              created_at: s.created_at,
              updated_at: s.updated_at,
            })
          ),
      ];
    }
    if (filter !== "all") {
      list = list.filter((e) => e.event_type === filter);
    }
    return list.sort((a, b) => {
      const d = a.scheduled_date.localeCompare(b.scheduled_date);
      if (d !== 0) return d;
      return (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
    });
  }, [bibleStudies, filter, ministryEvents, returnVisits]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const eventsOnDay = (iso: string) =>
    events.filter((e) => e.scheduled_date === iso);

  const agenda = useMemo(() => {
    return events.filter((e) => e.scheduled_date >= today).slice(0, 40);
  }, [events, today]);

  const selectedEvents = eventsOnDay(selectedDay);

  const hrefFor = (e: ScheduledMinistryEvent) => {
    if (e.event_type === "bible_study" && e.bible_study_id) {
      return `/bible-studies/${e.bible_study_id}`;
    }
    if (e.return_visit_id) return `/return-visits/${e.return_visit_id}`;
    return "/return-visits";
  };

  const nameFor = (e: ScheduledMinistryEvent) =>
    e.person?.name ||
    people.find((p) => p.id === e.person_id)?.name ||
    "Person";

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Calendar"
        subtitle="Return Visits and Bible Studies"
        accent="purple"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["return_visit", "Return Visits"],
            ["bible_study", "Bible Studies"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
              filter === key
                ? key === "bible_study"
                  ? "bg-amber-100 text-amber-900 ring-amber-200"
                  : key === "return_visit"
                    ? "bg-violet-100 text-violet-900 ring-violet-200"
                    : "bg-stone-800 text-white ring-stone-800"
                : "bg-white text-stone-600 ring-stone-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={view === "month" ? "primary" : "secondary"}
          className={cn(
            "flex-1",
            view === "month" && "bg-violet-700 hover:bg-violet-800"
          )}
          onClick={() => setView("month")}
        >
          Month
        </Button>
        <Button
          size="sm"
          variant={view === "agenda" ? "primary" : "secondary"}
          className={cn(
            "flex-1",
            view === "agenda" && "bg-violet-700 hover:bg-violet-800"
          )}
          onClick={() => setView("agenda")}
        >
          Agenda
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setCursor(parseISO(today));
            setSelectedDay(today);
          }}
        >
          Today
        </Button>
      </div>

      <Card className="space-y-2 text-xs">
        <p className="font-semibold uppercase tracking-wide text-stone-400">
          Legend
        </p>
        <div className="flex flex-wrap gap-3">
          <LegendDot className="bg-violet-500" label="Return Visit" />
          <LegendDot className="bg-amber-500" label="Bible Study" />
          <LegendDot className="bg-rose-500" label="Overdue" />
          <LegendDot className="bg-emerald-500" label="Completed" />
        </div>
      </Card>

      {view === "month" ? (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="rounded-xl p-2 text-stone-600 hover:bg-stone-100"
              onClick={() => setCursor((d) => addMonths(d, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="font-display text-lg font-semibold text-violet-950">
              {format(cursor, "MMMM yyyy")}
            </p>
            <button
              type="button"
              className="rounded-xl p-2 text-stone-600 hover:bg-stone-100"
              onClick={() => setCursor((d) => addMonths(d, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-stone-400">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={`${d}-${i}`} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const dayEvents = eventsOnDay(iso);
              const overdue = dayEvents.some(
                (e) =>
                  e.status === "planned" &&
                  isBefore(parseISO(e.scheduled_date), parseISO(today))
              );
              const hasRv = dayEvents.some((e) => e.event_type === "return_visit");
              const hasStudy = dayEvents.some(
                (e) => e.event_type === "bible_study"
              );
              const selected = iso === selectedDay;
              const isToday = isSameDay(day, parseISO(today));

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDay(iso)}
                  className={cn(
                    "relative flex min-h-12 flex-col items-center rounded-xl px-0.5 py-1 text-sm transition",
                    !isSameMonth(day, cursor) && "text-stone-300",
                    selected && "bg-stone-900 text-white",
                    !selected && isToday && "ring-1 ring-emerald-500",
                    !selected && "hover:bg-stone-100"
                  )}
                >
                  <span>{format(day, "d")}</span>
                  <span className="mt-1 flex gap-0.5">
                    {hasRv && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          overdue ? "bg-rose-500" : "bg-violet-500",
                          selected && !overdue && "bg-violet-200"
                        )}
                      />
                    )}
                    {hasStudy && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          overdue ? "bg-rose-500" : "bg-amber-500",
                          selected && !overdue && "bg-amber-200"
                        )}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {formatDisplayDate(selectedDay)}
            </p>
            {selectedEvents.length === 0 ? (
              <EmptyState title="Nothing scheduled" />
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    name={nameFor(e)}
                    href={hrefFor(e)}
                    today={today}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="space-y-2">
          {agenda.length === 0 ? (
            <EmptyState title="No upcoming appointments" />
          ) : (
            agenda.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                name={nameFor(e)}
                href={hrefFor(e)}
                today={today}
              />
            ))
          )}
        </section>
      )}

      <div className="flex gap-2">
        <Link href="/return-visits" className="flex-1">
          <Button variant="secondary" className="w-full" size="sm">
            All return visits
          </Button>
        </Link>
        <Link href="/bible-studies/new" className="flex-1">
          <Button
            className="w-full bg-amber-700 hover:bg-amber-800"
            size="sm"
          >
            Add Bible Study
          </Button>
        </Link>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-stone-600">
      <span className={cn("h-2 w-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function EventCard({
  event,
  name,
  href,
  today,
}: {
  event: ScheduledMinistryEvent;
  name: string;
  href: string;
  today: string;
}) {
  const overdue =
    event.status === "planned" &&
    isBefore(parseISO(event.scheduled_date), parseISO(today));
  const isStudy = event.event_type === "bible_study";

  return (
    <Link href={href}>
      <Card
        className={cn(
          "mb-2",
          isStudy ? "ring-amber-100" : "ring-violet-100",
          overdue && "ring-rose-200"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-stone-900">{name}</p>
            <p className="mt-1 text-sm text-stone-500">
              {formatDisplayDate(event.scheduled_date)}
              {event.scheduled_time ? ` · ${event.scheduled_time}` : ""}
            </p>
            {event.topic_or_lesson && (
              <p className="mt-2 text-sm text-stone-700">
                {event.topic_or_lesson}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge kind={isStudy ? "bible_study" : "return_visit"} />
            {overdue && <StatusBadge kind="overdue" />}
            {event.status === "completed" && <StatusBadge kind="completed" />}
          </div>
        </div>
      </Card>
    </Link>
  );
}
