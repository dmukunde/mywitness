"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { InterestBadge, INTEREST_LEVEL_ORDER } from "@/components/InterestBadge";
import {
  ScriptureBadgeList,
  StatusBadge,
  TopicBadge,
} from "@/components/badges";
import { formatDisplayDate } from "@/lib/utils";
import { INTEREST_LABELS, type InterestLevel } from "@/lib/types";

export default function PersonProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    people,
    conversations,
    returnVisits,
    bibleStudies,
    archivePerson,
    savePerson,
    createReturnVisit,
  } = useApp();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  const person = people.find((p) => p.id === params.id);

  const timeline = useMemo(
    () =>
      conversations
        .filter((c) => c.person_id === params.id)
        .sort((a, b) => b.conversation_date.localeCompare(a.conversation_date)),
    [conversations, params.id]
  );

  const nextVisit = returnVisits
    .filter((rv) => rv.person_id === params.id && rv.status === "planned")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];

  const [form, setForm] = useState({
    name: "",
    general_location: "",
    preferred_contact_time: "",
    first_met_date: "",
    interest_level: "" as InterestLevel | "",
    current_discussion_theme: "",
    key_questions: "",
    private_notes: "",
  });

  if (!person) {
    return (
      <EmptyState
        title="Person not found"
        action={
          <Link href="/people">
            <Button>Back to People</Button>
          </Link>
        }
      />
    );
  }

  const startEdit = () => {
    setForm({
      name: person.name,
      general_location: person.general_location || "",
      preferred_contact_time: person.preferred_contact_time || "",
      first_met_date: person.first_met_date || "",
      interest_level: person.interest_level || "",
      current_discussion_theme: person.current_discussion_theme || "",
      key_questions: person.key_questions || "",
      private_notes: person.private_notes || "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    await savePerson({
      id: person.id,
      name: form.name,
      general_location: form.general_location || null,
      preferred_contact_time: form.preferred_contact_time || null,
      first_met_date: form.first_met_date || null,
      interest_level: form.interest_level || "unknown",
      current_discussion_theme: form.current_discussion_theme || null,
      key_questions: form.key_questions || null,
      private_notes: form.private_notes || null,
    });
    setEditing(false);
  };

  const handleArchive = async () => {
    await archivePerson(person.id);
    router.replace("/people");
  };

  const handleSchedule = async () => {
    if (!scheduleDate) return;
    const visit = {
      person_id: person.id,
      conversation_id: timeline[0]?.id || null,
      scheduled_date: scheduleDate,
      scheduled_time: scheduleTime || null,
      status: "planned" as const,
      last_topic: person.current_discussion_theme,
      question_to_answer: person.key_questions,
      next_planned_topic: timeline[0]?.next_topic || null,
      general_location: person.general_location,
      preparation_notes: timeline[0]?.next_visit_preparation || null,
      completed_at: null,
    };
    try {
      await createReturnVisit(visit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("DUPLICATE_EVENT:")) {
        const ok = window.confirm(
          `${msg.replace("DUPLICATE_EVENT: ", "")}\n\nSave as a separate appointment anyway?`
        );
        if (!ok) return;
        await createReturnVisit(visit, { allowDuplicate: true });
      } else {
        throw err;
      }
    }
    setScheduling(false);
    setScheduleDate("");
    setScheduleTime("");
  };

  if (editing) {
    return (
      <div className="space-y-4 animate-fade-up">
        <PageHeader title="Edit Person" />
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="General location"
          value={form.general_location}
          onChange={(e) =>
            setForm({ ...form, general_location: e.target.value })
          }
        />
        <Input
          label="Preferred contact time"
          value={form.preferred_contact_time}
          onChange={(e) =>
            setForm({ ...form, preferred_contact_time: e.target.value })
          }
        />
        <Input
          label="First met date"
          type="date"
          value={form.first_met_date}
          onChange={(e) => setForm({ ...form, first_met_date: e.target.value })}
        />
        <Select
          label="Interest level"
          value={form.interest_level}
          onChange={(e) =>
            setForm({
              ...form,
              interest_level: e.target.value as InterestLevel | "",
            })
          }
        >
          <option value="">Not set</option>
          {INTEREST_LEVEL_ORDER.map((k) => (
            <option key={k} value={k}>
              {INTEREST_LABELS[k]}
            </option>
          ))}
        </Select>
        <Input
          label="Current discussion theme"
          value={form.current_discussion_theme}
          onChange={(e) =>
            setForm({ ...form, current_discussion_theme: e.target.value })
          }
        />
        <Textarea
          label="Key questions"
          value={form.key_questions}
          onChange={(e) => setForm({ ...form, key_questions: e.target.value })}
        />
        <Textarea
          label="Private notes"
          value={form.private_notes}
          onChange={(e) => setForm({ ...form, private_notes: e.target.value })}
        />
        <Button className="w-full" onClick={saveEdit}>
          Save changes
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={person.name}
        subtitle={person.general_location || "No location set"}
        action={<InterestBadge level={person.interest_level} showUnknown />}
      />

      {person.is_demo && <StatusBadge kind="demo" label="Demo data" />}

      <Card className="space-y-2 text-sm">
        <Row label="Preferred time" value={person.preferred_contact_time} />
        <Row
          label="First met"
          value={
            person.first_met_date
              ? formatDisplayDate(person.first_met_date)
              : null
          }
        />
        <div className="flex items-start justify-between gap-3">
          <span className="text-stone-500">Discussion theme</span>
          {person.current_discussion_theme ? (
            <TopicBadge topic={person.current_discussion_theme} />
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </div>
        <Row label="Key questions" value={person.key_questions} />
        <Row
          label="Next visit"
          value={
            nextVisit
              ? `${formatDisplayDate(nextVisit.scheduled_date)}${
                  nextVisit.scheduled_time ? ` · ${nextVisit.scheduled_time}` : ""
                }`
              : null
          }
        />
        {person.private_notes && (
          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Private notes
            </p>
            <p className="mt-1 text-stone-700">{person.private_notes}</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/conversations/record?personId=${person.id}`}>
          <Button variant="record" className="w-full" size="sm">
            Record
          </Button>
        </Link>
        <Link href={`/conversations/new?personId=${person.id}`}>
          <Button variant="secondary" className="w-full" size="sm">
            Written note
          </Button>
        </Link>
        <Button
          variant="secondary"
          className="w-full"
          size="sm"
          onClick={() => setScheduling(true)}
        >
          Schedule visit
        </Button>
        <Button variant="secondary" className="w-full" size="sm" onClick={startEdit}>
          Edit
        </Button>
      </div>
      {bibleStudies.some((s) => s.person_id === person.id) ? (
        <Link
          href={`/bible-studies/${
            bibleStudies.find((s) => s.person_id === person.id)!.id
          }`}
        >
          <Button className="w-full bg-amber-700 hover:bg-amber-800" size="sm">
            Open Bible Study
          </Button>
        </Link>
      ) : (
        <Link href={`/bible-studies/new?personId=${person.id}`}>
          <Button className="w-full bg-amber-700 hover:bg-amber-800" size="sm">
            Start Bible Study
          </Button>
        </Link>
      )}
      <Button
        variant="ghost"
        className="w-full text-rose-700"
        onClick={() => setArchiving(true)}
      >
        Archive Person
      </Button>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Conversation timeline
        </h2>
        {timeline.length === 0 ? (
          <EmptyState title="No conversations yet" />
        ) : (
          <div className="space-y-3">
            {timeline.map((c) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-stone-500">
                    {formatDisplayDate(c.conversation_date)}
                    {c.approximate_time ? ` · ${c.approximate_time}` : ""}
                  </p>
                  <InterestBadge level={person.interest_level} />
                </div>
                {c.main_topic ? (
                  <div className="mt-2">
                    <TopicBadge topic={c.main_topic} />
                  </div>
                ) : null}
                {c.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-stone-700">
                    {c.summary}
                  </p>
                )}
                {(c.scriptures?.length || 0) > 0 && (
                  <ScriptureBadgeList
                    className="mt-2"
                    references={c.scriptures!.map((s) => s.scripture_reference)}
                  />
                )}
                {c.questions_asked && (
                  <p className="mt-2 text-xs text-stone-500">
                    Questions: {c.questions_asked}
                  </p>
                )}
                {c.publications_shared && (
                  <p className="mt-1 text-xs text-stone-500">
                    Shared: {c.publications_shared}
                  </p>
                )}
                {c.next_topic && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-stone-500">Next:</span>
                    <TopicBadge topic={c.next_topic} tone="amber" />
                  </div>
                )}
                {!c.next_topic && c.action_required && (
                  <p className="mt-2 text-xs font-medium text-stone-600">
                    Next: {c.action_required}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={archiving}
        title="Archive this person?"
        message="They will be hidden from your list but their conversations remain private. You can restore later from exported data."
        confirmLabel="Archive"
        danger
        onConfirm={handleArchive}
        onCancel={() => setArchiving(false)}
      />

      <ConfirmDialog
        open={scheduling}
        title="Schedule return visit"
        message="Choose a date and optional time for the next visit."
        confirmLabel="Schedule"
        onConfirm={handleSchedule}
        onCancel={() => setScheduling(false)}
      />

      {scheduling && (
        <div className="fixed inset-x-0 bottom-24 z-50 mx-auto max-w-lg space-y-2 px-4">
          <Card className="space-y-3 shadow-lg">
            <Input
              label="Date"
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
            <Input
              label="Time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              placeholder="Afternoon"
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-stone-400">{label}</span>
      <span className="text-right text-stone-800">{value || "—"}</span>
    </div>
  );
}
