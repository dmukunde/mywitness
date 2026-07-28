"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { cn, formatDisplayDate, todayISO } from "@/lib/utils";
import type {
  MinistryEventType,
  ScheduledMinistryEvent,
} from "@/lib/types";
import { findDuplicateMinistryEvent } from "@/lib/ministry-scheduling";

type Filter = "all" | "return_visit" | "bible_study";
type ViewMode = "month" | "agenda";
type ScheduleStep = null | "choose" | "form";

function mergeCalendarEvents(
  ministryEvents: ScheduledMinistryEvent[],
  returnVisits: ReturnType<typeof useApp>["returnVisits"],
  bibleStudies: ReturnType<typeof useApp>["bibleStudies"]
): ScheduledMinistryEvent[] {
  const byKey = new Map<string, ScheduledMinistryEvent>();

  for (const e of ministryEvents) {
    if (e.status === "cancelled") continue;
    const key = e.return_visit_id
      ? `rv:${e.return_visit_id}`
      : e.bible_study_id
        ? `bs:${e.bible_study_id}:${e.scheduled_date}`
        : e.id;
    byKey.set(key, e);
  }

  for (const rv of returnVisits) {
    if (rv.status === "cancelled") continue;
    const key = `rv:${rv.id}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
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
    });
  }

  for (const s of bibleStudies) {
    if (!s.next_study_date) continue;
    if (s.status !== "active") continue;
    const key = `bs:${s.id}:${s.next_study_date}`;
    if (byKey.has(key)) continue;
    // Prefer an existing planned event for this study regardless of date key
    const existingPlanned = [...byKey.values()].find(
      (e) => e.bible_study_id === s.id && e.status === "planned"
    );
    if (existingPlanned) continue;
    byKey.set(key, {
      id: `bs-${s.id}`,
      user_id: s.user_id,
      person_id: s.person_id,
      event_type: "bible_study",
      return_visit_id: null,
      bible_study_id: s.id,
      scheduled_date: s.next_study_date,
      scheduled_time: s.next_study_time,
      general_location: s.general_location,
      topic_or_lesson: s.current_lesson,
      preparation_notes: s.preparation_notes,
      status: "planned",
      is_demo: s.is_demo,
      created_at: s.created_at,
      updated_at: s.updated_at,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const d = a.scheduled_date.localeCompare(b.scheduled_date);
    if (d !== 0) return d;
    return (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
  });
}

function CalendarInner() {
  const {
    ministryEvents,
    people,
    returnVisits,
    bibleStudies,
    createReturnVisit,
    saveBibleStudy,
    findDuplicateEvent,
  } = useApp();
  const searchParams = useSearchParams();
  const today = todayISO();
  const dateParam = searchParams.get("date");
  const initialDay =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;
  const [cursor, setCursor] = useState(() => parseISO(initialDay));
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const dayListRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!dateParam) return;
    requestAnimationFrame(() => {
      dayListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // Only run once on arrival via a deep link — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [scheduleStep, setScheduleStep] = useState<ScheduleStep>(null);
  const [scheduleType, setScheduleType] = useState<MinistryEventType>("return_visit");
  const [form, setForm] = useState({
    person_id: "",
    scheduled_date: today,
    scheduled_time: "",
    location: "",
    topic_or_lesson: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState(false);

  const events = useMemo(() => {
    let list = mergeCalendarEvents(ministryEvents, returnVisits, bibleStudies);
    if (filter !== "all") {
      list = list.filter((e) => e.event_type === filter);
    }
    return list;
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
  const isSelectedToday = selectedDay === today;

  const goToToday = () => {
    setView("month");
    setCursor(parseISO(today));
    setSelectedDay(today);
    // Scroll after paint so the day list is in view
    requestAnimationFrame(() => {
      dayListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    if (selectedDay === today && view === "month") {
      // Keep list visible when landing on today from navigation
    }
  }, [selectedDay, today, view]);

  const hrefFor = (e: ScheduledMinistryEvent) => {
    if (e.event_type === "bible_study" && e.bible_study_id) {
      return `/bible-studies/${e.bible_study_id}`;
    }
    if (e.return_visit_id) return `/return-visits/${e.return_visit_id}`;
    return e.event_type === "bible_study" ? "/bible-studies" : "/return-visits";
  };

  const nameFor = (e: ScheduledMinistryEvent) =>
    e.person?.name ||
    people.find((p) => p.id === e.person_id)?.name ||
    "Person";

  const openSchedule = () => {
    setScheduleStep("choose");
    setError(null);
    setDupConfirm(false);
    setForm({
      person_id: "",
      scheduled_date: selectedDay || today,
      scheduled_time: "",
      location: "",
      topic_or_lesson: "",
      notes: "",
    });
  };

  const saveSchedule = async (allowDuplicate = false) => {
    if (!form.person_id) {
      setError("Select a person.");
      return;
    }
    if (!form.scheduled_date) {
      setError("Choose a date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!allowDuplicate) {
        const dup =
          findDuplicateEvent({
            person_id: form.person_id,
            event_type: scheduleType,
            scheduled_date: form.scheduled_date,
            scheduled_time: form.scheduled_time,
          }) ||
          findDuplicateMinistryEvent(events, {
            person_id: form.person_id,
            event_type: scheduleType,
            scheduled_date: form.scheduled_date,
            scheduled_time: form.scheduled_time,
          });
        if (dup) {
          setDupConfirm(true);
          setError(
            "An appointment is already scheduled for this person at the same date and time."
          );
          setSaving(false);
          return;
        }
      }

      if (scheduleType === "return_visit") {
        await createReturnVisit(
          {
            person_id: form.person_id,
            conversation_id: null,
            scheduled_date: form.scheduled_date,
            scheduled_time: form.scheduled_time || null,
            status: "planned",
            last_topic: null,
            question_to_answer: null,
            next_planned_topic: form.topic_or_lesson || null,
            general_location: form.location || null,
            preparation_notes: form.notes || null,
            completed_at: null,
          },
          { allowDuplicate: true }
        );
      } else {
        const existingStudy = bibleStudies.find(
          (s) => s.person_id === form.person_id && s.status === "active"
        );
        if (existingStudy) {
          await saveBibleStudy(
            {
              person_id: existingStudy.person_id,
              publication: existingStudy.publication,
              starting_lesson: existingStudy.starting_lesson || "",
              current_lesson:
                form.topic_or_lesson || existingStudy.current_lesson || "",
              current_lesson_number: existingStudy.current_lesson_number,
              total_lessons: existingStudy.total_lessons,
              study_frequency: existingStudy.study_frequency,
              preferred_day: existingStudy.preferred_day || "",
              preferred_time: form.scheduled_time || existingStudy.preferred_time || "",
              first_study_date: existingStudy.first_study_date || "",
              next_study_date: form.scheduled_date,
              next_study_time: form.scheduled_time,
              general_location: form.location || existingStudy.general_location || "",
              status: "active",
              preparation_notes: form.notes || existingStudy.preparation_notes || "",
              private_notes: existingStudy.private_notes || "",
              source_return_visit_id: existingStudy.source_return_visit_id || "",
            },
            existingStudy.id,
            { allowDuplicate: true }
          );
        } else {
          const person = people.find((p) => p.id === form.person_id);
          await saveBibleStudy(
            {
              person_id: form.person_id,
              publication:
                form.topic_or_lesson ||
                person?.current_discussion_theme ||
                "Bible study",
              starting_lesson: form.topic_or_lesson || "Lesson 1",
              current_lesson: form.topic_or_lesson || "Lesson 1",
              current_lesson_number: 1,
              total_lessons: 60,
              study_frequency: "weekly",
              preferred_day: "",
              preferred_time: form.scheduled_time,
              first_study_date: form.scheduled_date,
              next_study_date: form.scheduled_date,
              next_study_time: form.scheduled_time,
              general_location: form.location || person?.general_location || "",
              status: "active",
              preparation_notes: form.notes,
              private_notes: "",
              source_return_visit_id: "",
            },
            undefined,
            { allowDuplicate: true }
          );
        }
      }

      setSelectedDay(form.scheduled_date);
      setCursor(parseISO(form.scheduled_date));
      setScheduleStep(null);
      setDupConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Calendar"
        subtitle="Return Visits and Bible Studies"
        accent="purple"
        action={
          <Button
            size="sm"
            className="bg-violet-700 hover:bg-violet-800"
            onClick={openSchedule}
          >
            <Plus className="h-4 w-4" />
            Schedule
          </Button>
        }
      />

      {scheduleStep === "choose" && (
        <Card className="space-y-3 ring-violet-100">
          <p className="text-sm font-medium text-stone-800">What are you scheduling?</p>
          <Button
            className="w-full bg-violet-700 hover:bg-violet-800"
            onClick={() => {
              setScheduleType("return_visit");
              setScheduleStep("form");
            }}
          >
            Return Visit
          </Button>
          <Button
            className="w-full bg-amber-700 hover:bg-amber-800"
            onClick={() => {
              setScheduleType("bible_study");
              setScheduleStep("form");
            }}
          >
            Bible Study
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setScheduleStep(null)}>
            Cancel
          </Button>
        </Card>
      )}

      {scheduleStep === "form" && (
        <Card
          className={cn(
            "space-y-3",
            scheduleType === "bible_study" ? "ring-amber-100" : "ring-violet-100"
          )}
        >
          <p className="text-sm font-semibold text-stone-800">
            {scheduleType === "bible_study" ? "Schedule Bible Study" : "Schedule Return Visit"}
          </p>
          <Select
            label="Person"
            value={form.person_id}
            onChange={(e) => setForm((f) => ({ ...f, person_id: e.target.value }))}
          >
            <option value="">Select person</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date"
              type="date"
              value={form.scheduled_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, scheduled_date: e.target.value }))
              }
            />
            <Input
              label="Time"
              value={form.scheduled_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, scheduled_time: e.target.value }))
              }
              placeholder="10:00 AM"
            />
          </div>
          <Input
            label="Location"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <Input
            label={scheduleType === "bible_study" ? "Lesson" : "Topic"}
            value={form.topic_or_lesson}
            onChange={(e) =>
              setForm((f) => ({ ...f, topic_or_lesson: e.target.value }))
            }
          />
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {dupConfirm && (
            <Button
              className="w-full"
              disabled={saving}
              onClick={() => void saveSchedule(true)}
            >
              Save anyway
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={saving}
              onClick={() => setScheduleStep("choose")}
            >
              Back
            </Button>
            <Button
              className={cn(
                "flex-1",
                scheduleType === "bible_study"
                  ? "bg-amber-700 hover:bg-amber-800"
                  : "bg-violet-700 hover:bg-violet-800"
              )}
              disabled={saving}
              onClick={() => void saveSchedule(false)}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
      )}

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
        <Button size="sm" variant="secondary" onClick={goToToday}>
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

          <section ref={dayListRef} className="scroll-mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
              {isSelectedToday ? "Today" : formatDisplayDate(selectedDay)}
            </p>
            {selectedEvents.length === 0 ? (
              <EmptyState
                title={
                  isSelectedToday
                    ? "Nothing scheduled today"
                    : "Nothing scheduled"
                }
              />
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
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <CalendarInner />
    </Suspense>
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
          overdue && "ring-rose-200",
          event.status === "completed" && "opacity-80 ring-emerald-100"
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
