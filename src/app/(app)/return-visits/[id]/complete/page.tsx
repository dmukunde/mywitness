"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useApp } from "@/lib/app-context";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SectionTitle,
  Textarea,
  TimeField,
} from "@/components/ui";
import { formatDbError } from "@/lib/db-errors";
import { formatDisplayDate, todayISO } from "@/lib/utils";
import {
  buildCompletionForm,
  hasVisitRecord,
  nextVisitDateProblem,
  type CompletionInput,
} from "@/lib/return-visit-completion";
import type { Person, ReturnVisit } from "@/lib/types";

export default function CompleteReturnVisitPage() {
  const params = useParams<{ id: string }>();
  const { returnVisits, people } = useApp();
  const visit = returnVisits.find((rv) => rv.id === params.id);
  const person = visit
    ? visit.person || people.find((p) => p.id === visit.person_id)
    : undefined;

  if (!visit || !person) {
    return (
      <EmptyState
        title="Return visit not found"
        action={
          <Link href="/return-visits">
            <Button>Back</Button>
          </Link>
        }
      />
    );
  }
  // Remounting per visit keeps the form's starting values tied to that visit.
  return <CompleteForm key={visit.id} visit={visit} person={person} />;
}

function CompleteForm({
  visit,
  person,
}: {
  visit: ReturnVisit;
  person: Person;
}) {
  const router = useRouter();
  const { updateReturnVisit, saveConversation, createReturnVisit } = useApp();
  const guard = useSingleFlight();
  // One id per open form: saving twice (a retry, a double tap) records one
  // visit, not two.
  const saveId = useRef<string | null>(null);
  // Once saving has begun the visit flips to "completed"; the form must stay
  // put so a failed save can be retried instead of bouncing away.
  const [started, setStarted] = useState(false);

  const [input, setInput] = useState<CompletionInput>({
    visitDate: todayISO(),
    // What was planned is the natural starting point for what was discussed.
    topic: visit.next_planned_topic || "",
    notes: "",
    nextTopic: "",
    nextDate: "",
    nextTime: "",
    nextPrep: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CompletionInput>(k: K, v: CompletionInput[K]) =>
    setInput((prev) => ({ ...prev, [k]: v }));

  if (visit.status !== "planned" && !started) {
    return (
      <EmptyState
        title="This visit is already completed"
        action={
          <Link href={`/return-visits/${visit.id}`}>
            <Button>View visit</Button>
          </Link>
        }
      />
    );
  }

  const doSave = async () => {
    const problem = nextVisitDateProblem(input);
    if (problem) {
      setError(problem);
      return;
    }
    saveId.current ??= crypto.randomUUID();
    setStarted(true);
    setBusy(true);
    setError(null);
    try {
      // 1. Resolve this visit. Safe to repeat — a retry just re-applies it.
      await updateReturnVisit(visit.id, {
        status: "completed",
        completed_at: visit.completed_at ?? new Date().toISOString(),
      });

      if (hasVisitRecord(input)) {
        // 2. The visit goes into the person's conversation history, and the
        //    next visit (if a date was chosen) is scheduled in the same step.
        const { conversation } = await saveConversation(
          buildCompletionForm(person, input, saveId.current)
        );
        // This visit's own notes now live on that entry (kept apart from the
        // preparation notes the visit was scheduled with).
        await updateReturnVisit(visit.id, { conversation_id: conversation.id });
      } else if (input.nextDate) {
        // Nothing to log, but the next visit was still asked for.
        await createReturnVisit(
          {
            person_id: person.id,
            conversation_id: visit.conversation_id,
            scheduled_date: input.nextDate,
            scheduled_time: input.nextTime || null,
            status: "planned",
            last_topic: visit.next_planned_topic || visit.last_topic,
            question_to_answer: person.key_questions,
            next_planned_topic: input.nextTopic.trim() || null,
            general_location: person.general_location,
            preparation_notes: input.nextPrep.trim() || null,
            completed_at: null,
          },
          { clientId: saveId.current }
        );
      }
      router.replace(`/people/${person.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.startsWith("DUPLICATE_EVENT:")
          ? `${msg.replace("DUPLICATE_EVENT: ", "")} Change the date or time and save again.`
          : formatDbError("complete visit", err, "Could not save. Please try again.")
      );
      setBusy(false);
    }
  };
  const handleSave = () => guard(doSave);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Complete visit"
        subtitle={`${person.name} · ${formatDisplayDate(visit.scheduled_date)}${
          visit.scheduled_time ? ` · ${visit.scheduled_time}` : ""
        }`}
      />

      {visit.preparation_notes && (
        <Card className="space-y-1 ring-violet-100/80">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            You prepared
          </p>
          <p className="text-sm text-stone-700">{visit.preparation_notes}</p>
        </Card>
      )}

      <section className="space-y-3">
        <SectionTitle title="How did it go? (optional)" />
        <Input
          label="Topic discussed"
          value={input.topic}
          onChange={(e) => set("topic", e.target.value)}
          placeholder="What did you talk about?"
        />
        <Textarea
          label="Notes"
          value={input.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="What you discussed, how they responded, anything to remember"
        />
        <Input
          label="Date of visit"
          type="date"
          value={input.visitDate}
          onChange={(e) => set("visitDate", e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <SectionTitle title="Next visit (optional)" />
        <Input
          label="Next topic"
          value={input.nextTopic}
          onChange={(e) => set("nextTopic", e.target.value)}
          placeholder="What do you plan to discuss next?"
        />
        <Input
          label="Date"
          type="date"
          value={input.nextDate}
          onChange={(e) => set("nextDate", e.target.value)}
          hint={
            input.nextTopic.trim() && !input.nextDate
              ? "Pick a date to put the next visit on your calendar."
              : undefined
          }
        />
        <TimeField
          label="Time"
          value={input.nextTime}
          onChange={(v) => set("nextTime", v)}
        />
        <Textarea
          label="Preparation for the next visit"
          value={input.nextPrep}
          onChange={(e) => set("nextPrep", e.target.value)}
          placeholder="Anything to bring or get ready"
        />
      </section>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Button className="w-full" disabled={busy} onClick={handleSave}>
          {busy ? "Saving…" : "Save & complete"}
        </Button>
        <Link href={`/return-visits/${visit.id}`} className="block">
          <Button variant="ghost" className="w-full" disabled={busy}>
            Cancel
          </Button>
        </Link>
      </div>
    </div>
  );
}
