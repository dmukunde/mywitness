"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
} from "@/components/ui";
import { InterestBadge, INTEREST_LEVEL_ORDER } from "@/components/InterestBadge";
import { PeopleCare } from "@/components/PeopleCare";
import { MinistryDaySheet } from "@/components/MinistryDaySheet";
import { StatusBadge, TopicBadge } from "@/components/badges";
import { formatDisplayDate } from "@/lib/utils";
import { INTEREST_LABELS, type Person } from "@/lib/types";
import { nextActivityForPerson } from "@/lib/schedule";
import {
  DAY_LABELS,
  DAY_SHORT,
  MINISTRY_DAYS,
  countByDay,
  daysOf,
  describeDays,
  matchesDay,
  type DayFilter,
  type MinistryDay,
} from "@/lib/ministry-days";
import { cn } from "@/lib/utils";

/** Day chips shown up front; any further days wait under "More". */
const QUICK_DAYS = 4;

type SortKey = "recent" | "upcoming" | "overdue" | "name";

export default function PeoplePage() {
  const { people, conversations, activities, areas } = useApp();
  const [query, setQuery] = useState("");
  const [interestFilter, setInterestFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [sorting, setSorting] = useState(false);

  const enriched = useMemo(() => {
    return people.map((person) => {
      const personConvs = conversations
        .filter((c) => c.person_id === person.id)
        .sort((a, b) => b.conversation_date.localeCompare(a.conversation_date));
      const latest = personConvs[0];
      // Earliest *unresolved* scheduled visit or Bible study — a visit that
      // has since been followed up can no longer keep the person Overdue.
      const nextVisit = nextActivityForPerson(activities, person.id);
      const overdue = nextVisit?.state === "overdue";
      // Worth a visit or a call: something is overdue, or nothing is planned.
      const needsFollowUp = overdue || !nextVisit;

      const haystack = [
        person.name,
        person.general_location,
        person.current_discussion_theme,
        person.key_questions,
        person.private_notes,
        ...daysOf(person).map((d) => DAY_LABELS[d]),
        latest?.main_topic,
        latest?.questions_asked,
        latest?.additional_notes,
        latest?.summary,
        ...(latest?.scriptures?.map((s) => s.scripture_reference) || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return { person, latest, nextVisit, overdue, needsFollowUp, haystack };
    });
  }, [people, conversations, activities]);

  // Search, interest and area narrow the list first; the day filter then
  // works within that, so "Wednesday" + one area shows just those people.
  const scoped = useMemo(() => {
    let list = enriched;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((item) => item.haystack.includes(q));
    if (interestFilter !== "all") {
      list = list.filter(
        (item) => item.person.interest_level === interestFilter
      );
    }
    if (areaFilter !== "all") {
      list = list.filter((item) => item.person.area_id === areaFilter);
    }
    return list;
  }, [enriched, query, interestFilter, areaFilter]);

  const dayCounts = useMemo(() => countByDay(scoped.map((i) => i.person)), [scoped]);
  const noDayCount = scoped.filter((i) => daysOf(i.person).length === 0).length;
  const everyoneByDay = useMemo(() => countByDay(people), [people]);
  const withoutDayTotal = people.filter((p) => daysOf(p).length === 0).length;
  const configuredDays = MINISTRY_DAYS.filter((d) => everyoneByDay[d] > 0);
  // The busiest days sit up front; the rest go under "More". The chosen day
  // always stays visible.
  const quickDays = useMemo(() => {
    const busiest = MINISTRY_DAYS.filter((d) => everyoneByDay[d] > 0)
      .sort((a, b) => everyoneByDay[b] - everyoneByDay[a])
      .slice(0, QUICK_DAYS);
    if (dayFilter !== "all" && dayFilter !== "none" && !busiest.includes(dayFilter)) {
      busiest.push(dayFilter);
    }
    return MINISTRY_DAYS.filter((d) => busiest.includes(d));
  }, [everyoneByDay, dayFilter]);
  const moreDays = configuredDays.filter((d) => !quickDays.includes(d));

  const inDay = useMemo(
    () => scoped.filter((item) => matchesDay(item.person, dayFilter)),
    [scoped, dayFilter]
  );
  const needsCount = inDay.filter((i) => i.needsFollowUp).length;

  const filtered = useMemo(() => {
    let list = inDay;
    if (needsOnly && dayFilter !== "all") list = list.filter((i) => i.needsFollowUp);

    list = [...list].sort((a, b) => {
      if (sort === "name") return a.person.name.localeCompare(b.person.name);
      if (sort === "recent") {
        const ad = a.latest?.conversation_date || a.person.updated_at;
        const bd = b.latest?.conversation_date || b.person.updated_at;
        return bd.localeCompare(ad);
      }
      if (sort === "upcoming") {
        const ad = a.nextVisit?.scheduled_date || "9999";
        const bd = b.nextVisit?.scheduled_date || "9999";
        return ad.localeCompare(bd);
      }
      // overdue first
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const ad = a.nextVisit?.scheduled_date || "9999";
      const bd = b.nextVisit?.scheduled_date || "9999";
      return ad.localeCompare(bd);
    });

    return list;
  }, [inDay, needsOnly, dayFilter, sort]);

  const chooseDay = (day: DayFilter) => {
    setDayFilter(day);
    setNeedsOnly(false);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="People"
        subtitle="Everyone you've recorded"
        action={
          <div className="flex gap-2">
            <Link href="/areas">
              <Button variant="secondary" size="sm">
                Areas
              </Button>
            </Link>
            <Link href="/people/new">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, topic, scripture, notes…"
            className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={interestFilter}
            onChange={(e) => setInterestFilter(e.target.value)}
          >
            <option value="all">All interest</option>
            {INTEREST_LEVEL_ORDER.map((k) => (
              <option key={k} value={k}>
                {INTEREST_LABELS[k]}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="recent">Sort: Recent</option>
            <option value="upcoming">Sort: Upcoming</option>
            <option value="overdue">Sort: Overdue</option>
            <option value="name">Sort: Name</option>
          </Select>
        </div>
        <Select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
        >
          <option value="all">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>

        {configuredDays.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by ministry day"
          >
            <DayChip active={dayFilter === "all"} onClick={() => chooseDay("all")}>
              All
            </DayChip>
            {quickDays.map((d) => (
              <DayChip
                key={d}
                active={dayFilter === d}
                onClick={() => chooseDay(d)}
                count={dayCounts[d]}
                label={DAY_LABELS[d]}
              >
                {DAY_SHORT[d]}
              </DayChip>
            ))}
            {moreDays.length > 0 && (
              <select
                aria-label="More days"
                value=""
                onChange={(e) => e.target.value && chooseDay(e.target.value as MinistryDay)}
                className="min-h-9 rounded-full bg-white px-3 text-xs font-semibold text-stone-700 ring-1 ring-stone-200"
              >
                <option value="">More ▾</option>
                {moreDays.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]} ({dayCounts[d]})
                  </option>
                ))}
              </select>
            )}
            {noDayCount > 0 && (
              <DayChip
                active={dayFilter === "none"}
                onClick={() => chooseDay("none")}
                count={noDayCount}
              >
                No day
              </DayChip>
            )}
          </div>
        )}

        {configuredDays.length > 0 && withoutDayTotal > 0 && (
          <button
            type="button"
            onClick={() => setSorting(true)}
            className="text-xs font-medium text-emerald-800 underline decoration-emerald-200 underline-offset-2"
          >
            Sort {withoutDayTotal} {withoutDayTotal === 1 ? "person" : "people"} into days
          </button>
        )}

        {dayFilter !== "all" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <span>
              <span className="font-semibold text-stone-800">
                {dayFilter === "none" ? "No ministry day yet" : DAY_LABELS[dayFilter]}
              </span>
              {" · "}
              {inDay.length} {inDay.length === 1 ? "person" : "people"}
            </span>
            {needsCount > 0 && (
              <button
                type="button"
                aria-pressed={needsOnly}
                onClick={() => setNeedsOnly((v) => !v)}
                className={cn(
                  "min-h-8 rounded-full px-3 font-semibold ring-1 transition",
                  needsOnly
                    ? "bg-amber-600 text-white ring-amber-600"
                    : "bg-white text-amber-800 ring-amber-200"
                )}
              >
                Needs follow-up ({needsCount})
              </button>
            )}
          </div>
        )}
        {dayFilter !== "all" && dayFilter !== "none" && (
          <p className="text-xs text-stone-500">
            A ministry day only groups people. It does not schedule a visit or send a
            reminder.
          </p>
        )}
      </div>

      {people.length > 0 && configuredDays.length === 0 && !query.trim() && (
        <Card className="mb-4 space-y-2 border-emerald-100 bg-emerald-50/60">
          <p className="text-sm font-semibold text-stone-900">
            Group your people by ministry day
          </p>
          <p className="text-xs text-stone-600">
            Tap the days you usually visit each person (Wednesday, Saturday…).
            Then pick a day here instead of scrolling the whole list.
          </p>
          <Button size="sm" onClick={() => setSorting(true)}>
            Sort into days
          </Button>
        </Card>
      )}

      {!query.trim() && <PeopleCare />}

      {filtered.length === 0 && dayFilter !== "all" ? (
        <EmptyState
          title={
            needsOnly
              ? "No one needs a follow-up here"
              : dayFilter === "none"
                ? "Everyone has a day"
                : `No one on ${DAY_LABELS[dayFilter]} yet`
          }
          description={
            dayFilter === "none" || needsOnly
              ? undefined
              : "Sort people into days, or choose days when you edit a person."
          }
          action={
            dayFilter === "none" || needsOnly ? undefined : (
              <Button onClick={() => setSorting(true)}>Sort into days</Button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No people found"
          description="Add a person or record a conversation to get started."
          action={
            <Link href="/people/new">
              <Button>Add Person</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(({ person, latest, nextVisit, overdue }) => (
            <PersonCard
              key={person.id}
              person={person}
              latestTopic={latest?.main_topic}
              lastContact={latest?.conversation_date || person.first_met_date}
              nextVisit={nextVisit?.scheduled_date}
              nextTopic={nextVisit?.topic_or_lesson}
              overdue={overdue}
            />
          ))}
        </div>
      )}

      {sorting && <MinistryDaySheet onClose={() => setSorting(false)} />}
    </div>
  );
}

function DayChip({
  active,
  onClick,
  count,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  /** Full name for screen readers, when the chip shows a short one. */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label && count !== undefined ? `${label}, ${count}` : undefined}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full px-3 text-xs font-semibold ring-1 transition",
        active
          ? "bg-emerald-700 text-white ring-emerald-700"
          : count === 0
            ? "bg-white text-stone-400 ring-stone-200"
            : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("ml-1", active ? "text-emerald-100" : "text-stone-400")}>
          {count}
        </span>
      )}
    </button>
  );
}

function PersonCard({
  person,
  latestTopic,
  lastContact,
  nextVisit,
  nextTopic,
  overdue,
}: {
  person: Person;
  latestTopic?: string | null;
  lastContact?: string | null;
  nextVisit?: string | null;
  nextTopic?: string | null;
  overdue: boolean;
}) {
  return (
    <Link href={`/people/${person.id}`}>
      <Card className="mb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-medium text-stone-900">{person.name}</p>
              {person.is_demo && <StatusBadge kind="demo" />}
              {overdue && <StatusBadge kind="overdue" />}
            </div>
            {(latestTopic || person.current_discussion_theme) ? (
              <div className="mt-2">
                <TopicBadge
                  topic={latestTopic || person.current_discussion_theme || ""}
                />
              </div>
            ) : (
              <p className="mt-1 text-sm text-stone-500">No topic yet</p>
            )}
            {daysOf(person).length > 0 && (
              <p className="mt-2 text-xs font-medium text-emerald-800">
                Usually {describeDays(daysOf(person))}
              </p>
            )}
            <p className="mt-2 text-xs text-stone-500">
              Last contact:{" "}
              {lastContact ? formatDisplayDate(lastContact) : "—"}
              {nextVisit
                ? ` · Next: ${formatDisplayDate(nextVisit)}`
                : " · No visit scheduled"}
            </p>
            {nextTopic && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-stone-500">Next topic:</span>
                <TopicBadge topic={nextTopic} tone="amber" />
              </div>
            )}
          </div>
          <InterestBadge level={person.interest_level} />
        </div>
      </Card>
    </Link>
  );
}
