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
import { StatusBadge, TopicBadge } from "@/components/badges";
import { formatDisplayDate } from "@/lib/utils";
import { INTEREST_LABELS, type Person } from "@/lib/types";
import { nextActivityForPerson } from "@/lib/schedule";

type SortKey = "recent" | "upcoming" | "overdue" | "name";

export default function PeoplePage() {
  const { people, conversations, activities, areas } = useApp();
  const [query, setQuery] = useState("");
  const [interestFilter, setInterestFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");

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

      const haystack = [
        person.name,
        person.general_location,
        person.current_discussion_theme,
        person.key_questions,
        person.private_notes,
        latest?.main_topic,
        latest?.questions_asked,
        latest?.additional_notes,
        latest?.summary,
        ...(latest?.scriptures?.map((s) => s.scripture_reference) || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return { person, latest, nextVisit, overdue, haystack };
    });
  }, [people, conversations, activities]);

  const filtered = useMemo(() => {
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
  }, [enriched, query, interestFilter, areaFilter, sort]);

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
      </div>

      {filtered.length === 0 ? (
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
    </div>
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
