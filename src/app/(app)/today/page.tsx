"use client";

import Link from "next/link";
import { useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Library, Mic, NotebookPen, NotebookText } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button, Card, EmptyState, SectionTitle } from "@/components/ui";
import { MinistryTimeEditor } from "@/components/MinistryTimeEditor";
import { MinistryTimer } from "@/components/MinistryTimer";
import { MinistryDaySessions } from "@/components/MinistryDaySessions";
import { InterestBadge } from "@/components/InterestBadge";
import {
  StatusBadge,
  SuccessBanner,
  TopicBadge,
} from "@/components/badges";
import {
  formatDisplayDate,
  formatFullDate,
  greetingForNow,
  todayISO,
  monthRange,
} from "@/lib/utils";
import { sumMinutesForRange, sumAllMinutes, sessionsOnDate } from "@/lib/ministry-time";
import type { BibleStudy, ReturnVisit } from "@/lib/types";

function TodayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    people,
    conversations,
    returnVisits,
    bibleStudies,
    activities,
    sessions,
    reminders,
    dismissReminder,
    displayName,
    saveDailyMinistryTime,
  } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const today = todayISO();

  const savedBanner =
    !dismissedBanner && searchParams.get("saved") === "1"
      ? "Conversation saved. Your return visit is on the dashboard."
      : null;

  // Everything scheduled comes from the same derived activity list that
  // People, Calendar and Bible Studies use, so Home can't disagree with them.
  const { visitsFor, studiesFor } = useMemo(() => {
    const rvById = new Map(returnVisits.map((rv) => [rv.id, rv]));
    const studyById = new Map(bibleStudies.map((s) => [s.id, s]));
    return {
      visitsFor: (state: "due" | "overdue" | "upcoming") =>
        activities
          .filter((a) => a.event_type === "return_visit" && a.state === state)
          .map((a) => rvById.get(a.return_visit_id!))
          .filter((rv): rv is ReturnVisit => !!rv),
      studiesFor: (state: "due" | "overdue" | "upcoming") =>
        activities
          .filter((a) => a.event_type === "bible_study" && a.state === state)
          .map((a) => studyById.get(a.bible_study_id!))
          .filter((s): s is BibleStudy => !!s),
    };
  }, [activities, returnVisits, bibleStudies]);

  // Overdue is summarized, never rendered as full cards, so it can't push
  // today's and upcoming activities down the page. Activities are already
  // sorted by date, so the first items are the most overdue.
  const overdueItems = useMemo(
    () =>
      activities
        .filter((a) => a.state === "overdue")
        .map((a) => ({
          key: a.id,
          href:
            a.event_type === "bible_study"
              ? `/bible-studies/${a.bible_study_id}`
              : `/return-visits/${a.return_visit_id}`,
          name: people.find((p) => p.id === a.person_id)?.name || "Person",
          date: a.scheduled_date,
          kind: a.event_type === "bible_study" ? "Bible study" : "Return visit",
        })),
    [activities, people]
  );
  const dueToday = visitsFor("due");
  const studiesDueToday = studiesFor("due");
  const nextReturnVisit = visitsFor("upcoming")[0] || null;
  const nextBibleStudy = studiesFor("upcoming")[0] || null;

  const todaysConversations = useMemo(
    () => conversations.filter((c) => c.conversation_date === today),
    [conversations, today]
  );

  const month = useMemo(() => monthRange(), []);
  const todaysSessions = useMemo(
    () => sessionsOnDate(sessions, today),
    [sessions, today]
  );
  const todaysMinistryMinutes = useMemo(
    () => sumMinutesForRange(sessions, today, today),
    [sessions, today]
  );
  const monthMinistryMinutes = useMemo(
    () => sumMinutesForRange(sessions, month.start, month.end),
    [sessions, month]
  );
  const allTimeMinistryMinutes = useMemo(
    () => sumAllMinutes(sessions),
    [sessions]
  );

  const hasMinistryTime = todaysMinistryMinutes > 0;
  const conversationLabel =
    todaysConversations.length === 1
      ? "1 conversation recorded"
      : `${todaysConversations.length} conversations recorded`;

  return (
    <div className="space-y-8 animate-fade-up">
      <header>
        <p
          className="font-display font-bold tracking-tight text-emerald-900"
          style={{ fontSize: 32, lineHeight: 1.15 }}
        >
          MyWitness
        </p>
        <p
          className="mt-1 font-medium text-stone-500"
          style={{ fontSize: 16, lineHeight: 1.4 }}
        >
          Personal Ministry Companion
        </p>
        <div
          className="mt-6 border-t border-stone-200/80 pt-5"
          aria-hidden="true"
        />
        <p className="text-stone-500" style={{ fontSize: 18, lineHeight: 1.4 }}>
          {formatFullDate(new Date())}
        </p>
        <p
          className="mt-2 font-semibold tracking-tight text-stone-800"
          style={{ fontSize: 24, lineHeight: 1.3 }}
        >
          {greetingForNow(displayName)}
        </p>
      </header>

      {savedBanner && (
        <SuccessBanner
          onDismiss={() => {
            setDismissedBanner(true);
            router.replace("/today", { scroll: false });
          }}
        >
          {savedBanner}
        </SuccessBanner>
      )}

      <MinistryTimer
        onStartManual={() => setEditOpen(true)}
        monthMinutes={monthMinistryMinutes}
        allTimeMinutes={allTimeMinistryMinutes}
      />
      <MinistryDaySessions sessions={todaysSessions} />
      {hasMinistryTime && (
        <p className="text-sm text-stone-500">{conversationLabel}</p>
      )}

      <div className="space-y-3">
        <Button
          variant="record"
          size="lg"
          className="w-full text-lg"
          onClick={() => router.push("/conversations/record")}
        >
          <Mic className="h-6 w-6" />
          Record Conversation
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => router.push("/conversations/new")}
        >
          <NotebookPen className="h-5 w-5" />
          Write Notes
        </Button>
      </div>

      <Card onClick={() => router.push("/notebook")}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100">
            <NotebookText className="h-5 w-5 text-stone-600" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-stone-900">Study Notebook</p>
            <p className="truncate text-sm text-stone-500">
              Family Worship, meeting prep, and your own notes
            </p>
          </div>
        </div>
      </Card>

      <Card onClick={() => router.push("/toolkit")}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
            <Library className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-stone-900">My Teaching Toolkit</p>
            <p className="truncate text-sm text-stone-500">
              FAQs, scriptures and conversation starters
            </p>
          </div>
        </div>
      </Card>

      {reminders.length > 0 && (
        <section>
          <SectionTitle title="Reminders" />
          <div className="space-y-2">
            {reminders.slice(0, 3).map((r) => (
              <Card
                key={r.id}
                className="flex items-start justify-between gap-3 ring-violet-100"
                onClick={() => {
                  if (r.return_visit_id) {
                    router.push(`/return-visits/${r.return_visit_id}`);
                  } else {
                    router.push("/return-visits");
                  }
                }}
              >
                <div>
                  <p className="font-medium text-stone-900">{r.title}</p>
                  {r.body && (
                    <p className="mt-1 text-sm text-stone-500">{r.body}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-violet-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    void dismissReminder(r.id);
                  }}
                >
                  Dismiss
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <SectionTitle title="Today" />
        {dueToday.length === 0 && studiesDueToday.length === 0 ? (
          <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm text-stone-500 ring-1 ring-stone-200/60">
            Nothing scheduled for today.
          </p>
        ) : (
          <>
            {dueToday.map((rv) => (
              <Link key={rv.id} href={`/return-visits/${rv.id}`}>
                <Card className="mb-2 ring-violet-100/80">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">
                        {rv.person?.name ||
                          people.find((p) => p.id === rv.person_id)?.name ||
                          "Person"}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {rv.scheduled_time || "Anytime"}
                      </p>
                      {rv.last_topic && (
                        <p className="mt-2 text-xs text-stone-500">
                          Last: {rv.last_topic}
                        </p>
                      )}
                      {rv.next_planned_topic && (
                        <div className="mt-2">
                          <TopicBadge topic={rv.next_planned_topic} tone="amber" />
                        </div>
                      )}
                    </div>
                    <StatusBadge kind="return_visit" />
                  </div>
                </Card>
              </Link>
            ))}
            {studiesDueToday.map((study) => {
              const student =
                study.person ||
                people.find((p) => p.id === study.person_id);
              return (
                <Link key={study.id} href={`/bible-studies/${study.id}`}>
                  <Card className="mb-2 ring-amber-100/90">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-stone-900">
                          {student?.name || "Student"}
                        </p>
                        <p className="mt-1 text-sm text-stone-500">
                          {study.next_study_time || "Anytime"}
                        </p>
                        {study.current_lesson && (
                          <div className="mt-2">
                            <TopicBadge
                              topic={study.current_lesson}
                              tone="amber"
                            />
                          </div>
                        )}
                        {study.preparation_notes && (
                          <p className="mt-2 text-xs text-stone-500">
                            Prepare: {study.preparation_notes}
                          </p>
                        )}
                      </div>
                      <StatusBadge kind="bible_study" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </>
        )}
      </section>

      {(nextReturnVisit || nextBibleStudy) && (
        <section className="space-y-2">
          <SectionTitle title="Up next" />
          {nextReturnVisit && (
            <Link href={`/return-visits/${nextReturnVisit.id}`}>
              <Card className="mb-2 ring-violet-100/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
                      Next return visit
                    </p>
                    <p className="mt-1 font-medium text-stone-900">
                      {nextReturnVisit.person?.name ||
                        people.find((p) => p.id === nextReturnVisit.person_id)
                          ?.name ||
                        "Person"}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {formatDisplayDate(nextReturnVisit.scheduled_date)}
                      {nextReturnVisit.scheduled_time
                        ? ` · ${nextReturnVisit.scheduled_time}`
                        : ""}
                    </p>
                    {nextReturnVisit.next_planned_topic && (
                      <div className="mt-2">
                        <TopicBadge
                          topic={nextReturnVisit.next_planned_topic}
                          tone="amber"
                        />
                      </div>
                    )}
                  </div>
                  <StatusBadge kind="return_visit" />
                </div>
              </Card>
            </Link>
          )}
          {nextBibleStudy && (
            <Link href={`/bible-studies/${nextBibleStudy.id}`}>
              <Card className="mb-2 ring-amber-100/70">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Next Bible study
                    </p>
                    <p className="mt-1 font-medium text-stone-900">
                      {nextBibleStudy.person?.name ||
                        people.find((p) => p.id === nextBibleStudy.person_id)
                          ?.name ||
                        "Student"}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {formatDisplayDate(nextBibleStudy.next_study_date!)}
                      {nextBibleStudy.next_study_time
                        ? ` · ${nextBibleStudy.next_study_time}`
                        : ""}
                    </p>
                    {nextBibleStudy.current_lesson && (
                      <div className="mt-2">
                        <TopicBadge
                          topic={nextBibleStudy.current_lesson}
                          tone="amber"
                        />
                      </div>
                    )}
                  </div>
                  <StatusBadge kind="bible_study" />
                </div>
              </Card>
            </Link>
          )}
        </section>
      )}

      {overdueItems.length > 0 && (
        <section>
          <SectionTitle title="Overdue" />
          <Card className="bg-rose-50/60 ring-rose-200">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-rose-900">
                {overdueItems.length} overdue follow-up
                {overdueItems.length === 1 ? "" : "s"}
              </p>
              {overdueItems.length > 2 && (
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-rose-800"
                  onClick={() => setShowAllOverdue((v) => !v)}
                >
                  {showAllOverdue ? "Show less" : "View all"}
                </button>
              )}
            </div>
            <ul className="mt-1 divide-y divide-rose-100">
              {(showAllOverdue ? overdueItems : overdueItems.slice(0, 2)).map(
                (item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="truncate font-medium text-stone-900">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs text-rose-800">
                        {item.kind} · {formatDisplayDate(item.date)}
                      </span>
                    </Link>
                  </li>
                )
              )}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle title="Conversations today" />
        {todaysConversations.length === 0 ? (
          <EmptyState
            title="No conversations yet today"
            description="Tap Record Conversation to capture one in seconds."
          />
        ) : (
          <div className="space-y-2">
            {todaysConversations.map((c) => {
              const person =
                c.person || people.find((p) => p.id === c.person_id);
              return (
                <Link
                  key={c.id}
                  href={c.person_id ? `/people/${c.person_id}` : "/people"}
                >
                  <Card className="mb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-stone-900">
                          {person?.name || "Unknown"}
                        </p>
                        {c.main_topic ? (
                          <div className="mt-2">
                            <TopicBadge topic={c.main_topic} />
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-stone-500">
                            {c.summary || "Conversation"}
                          </p>
                        )}
                      </div>
                      <InterestBadge
                        level={
                          person?.interest_level || c.interest_level || null
                        }
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <MinistryTimeEditor
        open={editOpen}
        initialDate={today}
        onClose={() => setEditOpen(false)}
        onSave={async (input) => {
          await saveDailyMinistryTime(input);
        }}
      />
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <TodayInner />
    </Suspense>
  );
}
