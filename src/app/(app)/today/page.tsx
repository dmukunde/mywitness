"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Mic, NotebookPen, Square, Play } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useElapsedTimer } from "@/hooks/useElapsedTimer";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  ConfirmDialog,
} from "@/components/ui";
import {
  formatDisplayDate,
  formatFullDate,
  formatDuration,
  greetingForNow,
  interestColor,
  todayISO,
} from "@/lib/utils";
import { INTEREST_LABELS } from "@/lib/types";

export default function TodayPage() {
  const {
    user,
    people,
    conversations,
    returnVisits,
    sessions,
    activeSession,
    startSession,
    endSession,
    reminders,
    dismissReminder,
  } = useApp();
  const { label: timerLabel, elapsedMs } = useElapsedTimer(
    activeSession?.start_time
  );
  const [ending, setEnding] = useState(false);
  const [starting, setStarting] = useState(false);
  const today = todayISO();

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  const dueToday = useMemo(
    () =>
      returnVisits.filter(
        (rv) => rv.status === "planned" && rv.scheduled_date === today
      ),
    [returnVisits, today]
  );

  const upcoming = useMemo(
    () =>
      returnVisits
        .filter(
          (rv) =>
            rv.status === "planned" &&
            rv.scheduled_date > today
        )
        .slice(0, 3),
    [returnVisits, today]
  );

  const todaysConversations = useMemo(
    () => conversations.filter((c) => c.conversation_date === today),
    [conversations, today]
  );

  const ministryMinutesToday = useMemo(() => {
    return sessions
      .filter((s) => s.session_date === today)
      .reduce((sum, s) => {
        if (s.duration_minutes) return sum + s.duration_minutes;
        if (!s.end_time && s.id === activeSession?.id) {
          return sum + Math.floor(elapsedMs / 60000);
        }
        return sum;
      }, 0);
  }, [sessions, today, activeSession, elapsedMs]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startSession({ ministry_type: "informal_witnessing" });
    } finally {
      setStarting(false);
    }
  };

  const handleEnd = async () => {
    await endSession();
    setEnding(false);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header>
        <p className="text-sm text-stone-500">{formatFullDate(new Date())}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-stone-900">
          {greetingForNow(displayName)}
        </h1>
      </header>

      <Card className="bg-gradient-to-br from-teal-800 to-emerald-700 text-white ring-0">
        {activeSession ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-teal-100">Ministry session active</p>
                <p className="mt-1 font-display text-4xl font-semibold tracking-tight">
                  {timerLabel}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                <Play className="h-5 w-5 fill-current" />
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full bg-white text-teal-900 hover:bg-teal-50"
              onClick={() => setEnding(true)}
            >
              <Square className="h-4 w-4" />
              End Session
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-teal-100">Ready when you are</p>
            <p className="font-display text-2xl font-semibold">
              Start a ministry session
            </p>
            <Button
              variant="secondary"
              className="w-full bg-white text-teal-900 hover:bg-teal-50"
              disabled={starting}
              onClick={handleStart}
            >
              {starting ? "Starting…" : "Start Ministry Session"}
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <Link href="/conversations/record" className="block">
          <Button variant="record" size="lg" className="w-full text-lg">
            <Mic className="h-6 w-6" />
            Record Conversation
          </Button>
        </Link>
        <Link href="/conversations/new" className="block">
          <Button variant="secondary" className="w-full">
            <NotebookPen className="h-5 w-5" />
            Add Conversation
          </Button>
        </Link>
      </div>

      <Card>
        <p className="text-sm text-stone-500">Ministry time today</p>
        <p className="mt-1 font-display text-3xl font-semibold text-teal-900">
          {formatDuration(ministryMinutesToday)}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {todaysConversations.length}{" "}
          {todaysConversations.length === 1 ? "conversation" : "conversations"}{" "}
          recorded
        </p>
      </Card>

      {reminders.length > 0 && (
        <section>
          <SectionTitle title="Reminders" />
          <div className="space-y-2">
            {reminders.slice(0, 3).map((r) => (
              <Card key={r.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-stone-900">{r.title}</p>
                  {r.body && (
                    <p className="mt-1 text-sm text-stone-500">{r.body}</p>
                  )}
                </div>
                <button
                  className="text-xs text-teal-800"
                  onClick={() => dismissReminder(r.id)}
                >
                  Dismiss
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="Return visits due today" />
        {dueToday.length === 0 ? (
          <EmptyState title="No return visits due today" />
        ) : (
          <div className="space-y-2">
            {dueToday.map((rv) => (
              <Link key={rv.id} href={`/return-visits/${rv.id}`}>
                <Card className="mb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-stone-900">
                        {rv.person?.name ||
                          people.find((p) => p.id === rv.person_id)?.name ||
                          "Person"}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {rv.scheduled_time || "Anytime"} ·{" "}
                        {rv.next_planned_topic || rv.last_topic || "Follow up"}
                      </p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800">Today</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title="Upcoming return visits" />
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing scheduled ahead" />
        ) : (
          <div className="space-y-2">
            {upcoming.map((rv) => (
              <Link key={rv.id} href={`/return-visits/${rv.id}`}>
                <Card className="mb-2">
                  <p className="font-medium text-stone-900">
                    {rv.person?.name ||
                      people.find((p) => p.id === rv.person_id)?.name ||
                      "Person"}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    {formatDisplayDate(rv.scheduled_date)}
                    {rv.scheduled_time ? ` · ${rv.scheduled_time}` : ""}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

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
                      <div>
                        <p className="font-medium text-stone-900">
                          {person?.name || "Unknown"}
                        </p>
                        <p className="mt-1 text-sm text-stone-500">
                          {c.main_topic || c.summary || "Conversation"}
                        </p>
                      </div>
                      {c.interest_level && (
                        <Badge className={interestColor(c.interest_level)}>
                          {INTEREST_LABELS[c.interest_level]}
                        </Badge>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={ending}
        title="End ministry session?"
        message="Your session time will be saved. You can still add conversations later."
        confirmLabel="End session"
        onConfirm={handleEnd}
        onCancel={() => setEnding(false)}
      />
    </div>
  );
}
