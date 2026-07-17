"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { formatDisplayDate, scripturesToString } from "@/lib/utils";

export default function ReturnVisitPrepPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { returnVisits, people, conversations, updateReturnVisit } = useApp();
  const visit = returnVisits.find((rv) => rv.id === params.id);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  if (!visit) {
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

  const person =
    visit.person || people.find((p) => p.id === visit.person_id) || null;
  const conversation =
    visit.conversation ||
    conversations.find((c) => c.id === visit.conversation_id) ||
    conversations
      .filter((c) => c.person_id === visit.person_id)
      .sort((a, b) => b.conversation_date.localeCompare(a.conversation_date))[0];

  const markCompleted = async () => {
    await updateReturnVisit(visit.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
    router.replace("/return-visits");
  };

  const cancelVisit = async () => {
    await updateReturnVisit(visit.id, { status: "cancelled" });
    router.replace("/return-visits");
  };

  const reschedule = async () => {
    if (!date) return;
    await updateReturnVisit(visit.id, {
      scheduled_date: date,
      scheduled_time: time || null,
      preparation_notes: notes || visit.preparation_notes,
      status: "planned",
    });
    setRescheduling(false);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={person?.name || "Return visit"}
        subtitle={`${formatDisplayDate(visit.scheduled_date)}${
          visit.scheduled_time ? ` · ${visit.scheduled_time}` : ""
        }`}
      />

      <Card className="space-y-3">
        <Block
          label="Previous conversation summary"
          value={conversation?.summary || visit.last_topic}
        />
        <Block
          label="Scriptures previously discussed"
          value={
            conversation?.scriptures?.length
              ? scripturesToString(
                  conversation.scriptures.map((s) => s.scripture_reference)
                )
              : null
          }
        />
        <Block
          label="Unresolved questions"
          value={visit.question_to_answer || conversation?.questions_asked}
        />
        <Block label="Planned next topic" value={visit.next_planned_topic} />
        <Block
          label="Personal preparation notes"
          value={visit.preparation_notes || conversation?.next_visit_preparation}
        />
        <Block label="Location" value={visit.general_location} />
      </Card>

      <div className="space-y-2">
        {visit.status === "planned" && (
          <>
            <Button className="w-full" onClick={markCompleted}>
              Mark completed
            </Button>
            <Link
              href={`/conversations/record?personId=${visit.person_id}&returnVisitId=${visit.id}`}
              className="block"
            >
              <Button variant="record" className="w-full">
                Record new conversation
              </Button>
            </Link>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setDate(visit.scheduled_date);
                setTime(visit.scheduled_time || "");
                setNotes(visit.preparation_notes || "");
                setRescheduling(true);
              }}
            >
              Reschedule
            </Button>
            <Button
              variant="ghost"
              className="w-full text-rose-700"
              onClick={() => setCancelling(true)}
            >
              Cancel visit
            </Button>
          </>
        )}
        {person && (
          <Link href={`/people/${person.id}`} className="block">
            <Button variant="ghost" className="w-full">
              Open person profile
            </Button>
          </Link>
        )}
      </div>

      {rescheduling && (
        <Card className="space-y-3">
          <Input
            label="New date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Textarea
            label="Preparation notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button className="w-full" onClick={reschedule}>
            Save new schedule
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setRescheduling(false)}
          >
            Cancel
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={cancelling}
        title="Cancel this return visit?"
        message="The visit will be marked cancelled. You can schedule a new one anytime."
        confirmLabel="Cancel visit"
        danger
        onConfirm={cancelVisit}
        onCancel={() => setCancelling(false)}
      />
    </div>
  );
}

function Block({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-stone-800">
        {value || "—"}
      </p>
    </div>
  );
}
