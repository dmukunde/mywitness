"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/app-context";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import {
  formatDuration,
  monthRange,
  todayISO,
  weekRange,
} from "@/lib/utils";
import { isBefore, parseISO } from "date-fns";

export default function ActivityPage() {
  const { sessions, conversations, returnVisits, people } = useApp();
  const today = todayISO();
  const week = weekRange();
  const month = monthRange();

  const stats = useMemo(() => {
    const minutesFor = (start: string, end: string) =>
      sessions
        .filter((s) => s.session_date >= start && s.session_date <= end)
        .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

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

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Activity"
        subtitle="Private reflection — for your eyes only"
      />

      <section>
        <SectionTitle title="Ministry time" />
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Today" value={formatDuration(stats.dayMinutes)} />
          <Stat label="This week" value={formatDuration(stats.weekMinutes)} />
          <Stat label="This month" value={formatDuration(stats.monthMinutes)} />
        </div>
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
        <p className="mt-2 text-xs text-stone-400">
          “First met” counts people first recorded this month.
        </p>
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
              <Card key={topic} className="flex justify-between gap-3 py-3">
                <span className="text-sm text-stone-800">{topic}</span>
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
              <Card key={ref} className="flex justify-between gap-3 py-3">
                <span className="text-sm text-stone-800">{ref}</span>
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
      <p className="mt-1 font-display text-xl font-semibold text-teal-900">
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
