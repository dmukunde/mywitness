"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, NotebookPen } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
} from "@/components/ui";
import { MinistryTimeEditor } from "@/components/MinistryTimeEditor";
import {
  formatDisplayDate,
  formatFullDate,
  formatDuration,
  greetingForNow,
  interestColor,
  todayISO,
  minutesBetween,
} from "@/lib/utils";
import { INTEREST_LABELS } from "@/lib/types";
import { Suspense } from "react";

function TodayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    people,
    conversations,
    returnVisits,
    sessions,
    reminders,
    dismissReminder,
    displayName,
    saveDailyMinistryTime,
  } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const today = todayISO();

  const savedBanner =
    !dismissedBanner && searchParams.get("saved") === "1"
      ? "Conversation saved. Your return visit is on the dashboard."
      : null;

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
        .filter((rv) => rv.status === "planned" && rv.scheduled_date > today)
        .slice(0, 5),
    [returnVisits, today]
  );

  const todaysConversations = useMemo(
    () => conversations.filter((c) => c.conversation_date === today),
    [conversations, today]
  );

  const primaryTodaySession = useMemo(() => {
    return (
      sessions
        .filter((s) => s.session_date === today)
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0] || null
    );
  }, [sessions, today]);

  const todaysMinistryMinutes = useMemo(() => {
    if (!primaryTodaySession) return 0;
    if (primaryTodaySession.duration_minutes != null) {
      return primaryTodaySession.duration_minutes;
    }
    if (primaryTodaySession.end_time) {
      return minutesBetween(
        primaryTodaySession.start_time,
        primaryTodaySession.end_time
      );
    }
    return 0;
  }, [primaryTodaySession]);

  const hasMinistryTime = todaysMinistryMinutes > 0;
  const conversationLabel =
    todaysConversations.length === 1
      ? "1 conversation recorded"
      : `${todaysConversations.length} conversations recorded`;

  return (
    <div className="space-y-8 animate-fade-up">
      <header>
        <p
          className="font-display font-bold tracking-tight text-teal-900"
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
        <div className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-100">
          {savedBanner}
          <button
            className="ml-2 text-teal-700 underline"
            onClick={() => {
              setDismissedBanner(true);
              router.replace("/today", { scroll: false });
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <Card>
        <p className="text-sm font-medium text-stone-500">Today&apos;s Ministry</p>
        {!hasMinistryTime ? (
          <>
            <p className="mt-3 text-sm text-stone-500">Time spent today</p>
            <p className="mt-1 font-display text-2xl font-semibold text-stone-800">
              {formatDuration(0)}
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => setEditOpen(true)}
            >
              Add ministry time
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-2xl font-semibold text-teal-800">
              {formatDuration(todaysMinistryMinutes)}
            </p>
            <p className="mt-1 text-sm text-stone-500">{conversationLabel}</p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => setEditOpen(true)}
            >
              Edit time
            </Button>
          </>
        )}
      </Card>

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

      {reminders.length > 0 && (
        <section>
          <SectionTitle title="Reminders" />
          <div className="space-y-2">
            {reminders.slice(0, 3).map((r) => (
              <Card
                key={r.id}
                className="flex items-start justify-between gap-3"
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
                  className="shrink-0 text-xs text-teal-800"
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

      <MinistryTimeEditor
        open={editOpen}
        initialDate={today}
        initialMinutes={todaysMinistryMinutes}
        initialNotes={primaryTodaySession?.personal_reflection || ""}
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
