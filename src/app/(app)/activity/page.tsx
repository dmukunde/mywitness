"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { ScriptureBadge, TopicBadge } from "@/components/badges";
import {
  formatDuration,
  formatDisplayDate,
  monthRange,
  todayISO,
  weekRange,
} from "@/lib/utils";
import { sumMinutesForRange, groupMinutesByDate } from "@/lib/ministry-time";
import { isBefore, parseISO } from "date-fns";

export default function ActivityPage() {
  const router = useRouter();
  const { sessions, conversations, returnVisits, people } = useApp();
  const today = todayISO();
  const week = weekRange();
  const month = monthRange();

  const stats = useMemo(() => {
    // Ministry minutes come only from saved ministry_sessions rows — the
    // same shared helper Today and Calendar use, so totals never drift.
    const minutesFor = (start: string, end: string) =>
      sumMinutesForRange(sessions, start, end);

    const convCount = (start: string, end: string) =>
      conversations.filter(
        (c) => c.conversation_date >= start && c.conversation_date <= end
      ).length;

    const completedVisits = returnVisits.filter(
      (rv) => rv.status === "completed"
    ).length;

    const overdue = returnVisits.filter(
      (rv) =>
        rv.status === "planned" &&
        isBefore(parseISO(rv.scheduled_date), parseISO(today))
    ).length;

    const firstMetThisMonth = people.filter(
      (p) =>
        p.first_met_date &&
        p.first_met_date >= month.start &&
        p.first_met_date <= month.end
    ).length;

    const topics = conversations
      .map((c) => c.main_topic)
      .filter(Boolean) as string[];
    const topicCounts = countFreq(topics);

    const scriptures = conversations.flatMap(
      (c) => c.scriptures?.map((s) => s.scripture_reference) || []
    );
    const scriptureCounts = countFreq(scriptures);

    return {
      dayMinutes: minutesFor(today, today),
      weekMinutes: minutesFor(week.start, week.end),
      monthMinutes: minutesFor(month.start, month.end),
      dayConvos: convCount(today, today),
      weekConvos: convCount(week.start, week.end),
      monthConvos: convCount(month.start, month.end),
      completedVisits,
      overdue,
      firstMetThisMonth,
      topTopics: topicCounts.slice(0, 5),
      topScriptures: scriptureCounts.slice(0, 5),
    };
  }, [sessions, conversations, returnVisits, people, today, week, month]);

  const recentDays = useMemo(() => {
    const byDate = groupMinutesByDate(sessions);
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14);
  }, [sessions]);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Activity"
        subtitle="Private reflection — for your eyes only"
      />

      <section>
        <SectionTitle title="Ministry time" />
        <p className="mb-2 text-xs text-stone-500">
          Logged daily totals — not calculated from conversations.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Today" value={formatDuration(stats.dayMinutes)} />
          <Stat label="This week" value={formatDuration(stats.weekMinutes)} />
          <Stat label="This month" value={formatDuration(stats.monthMinutes)} />
        </div>
      </section>

      <section>
        <SectionTitle title="Recent days" />
        {recentDays.length === 0 ? (
          <Card>
            <p className="text-sm text-stone-500">No ministry time logged yet</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentDays.map(([date, minutes]) => (
              <Card
                key={date}
                className={date === today ? "cursor-pointer" : undefined}
                onClick={
                  date === today ? () => router.push("/today") : undefined
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-stone-900">
                    {formatDisplayDate(date)}
                  </p>
                  <p className="font-display text-lg font-semibold text-emerald-900">
                    {formatDuration(minutes)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title="Conversations" />
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Today" value={String(stats.dayConvos)} />
          <Stat label="This week" value={String(stats.weekConvos)} />
          <Stat label="This month" value={String(stats.monthConvos)} />
        </div>
      </section>

      <section>
        <SectionTitle title="Return visits & people" />
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Completed" value={String(stats.completedVisits)} />
          <Stat label="Overdue" value={String(stats.overdue)} />
          <Stat label="First met" value={String(stats.firstMetThisMonth)} />
        </div>
      </section>

      <section>
        <SectionTitle title="Topics discussed often" />
        {stats.topTopics.length === 0 ? (
          <Card>
            <p className="text-sm text-stone-500">No topics yet</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {stats.topTopics.map(([topic, count]) => (
              <Card key={topic} className="flex items-center justify-between gap-3 py-3">
                <TopicBadge topic={topic} />
                <span className="text-sm text-stone-400">{count}</span>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title="Scriptures used often" />
        {stats.topScriptures.length === 0 ? (
          <Card>
            <p className="text-sm text-stone-500">No scriptures yet</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {stats.topScriptures.map(([ref, count]) => (
              <Card key={ref} className="flex items-center justify-between gap-3 py-3">
                <ScriptureBadge reference={ref} />
                <span className="text-sm text-stone-400">{count}</span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="text-center">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-emerald-900">
        {value}
      </p>
    </Card>
  );
}

function countFreq(items: string[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
