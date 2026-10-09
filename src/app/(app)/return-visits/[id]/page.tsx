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
  LocationField,
  PageHeader,
  Sheet,
  Textarea,
  TimeField,
} from "@/components/ui";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { visitNotesFor } from "@/lib/return-visit-completion";
import {
  formatDisplayDate,
  todayISO,
} from "@/lib/utils";
import {
  ScriptureBadgeList,
  StatusBadge,
  SuccessBanner,
  TopicBadge,
  statusKindFromReturnVisit,
} from "@/components/badges";
import { InterestBadge } from "@/components/InterestBadge";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PersonPhotoGallery } from "@/components/PersonPhotoGallery";
import { isBefore, parseISO } from "date-fns";
import { formatDbError } from "@/lib/db-errors";

export default function ReturnVisitPrepPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { returnVisits, people, conversations, updateReturnVisit, deleteReturnVisit } =
    useApp();
  const visit = returnVisits.find((rv) => rv.id === params.id);
  const guard = useSingleFlight();
  const [notice, setNotice] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");

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

  const today = todayISO();
  const overdue =
    visit.status === "planned" &&
    isBefore(parseISO(visit.scheduled_date), parseISO(today));
  const isToday =
    visit.status === "planned" && visit.scheduled_date === today;
  const statusKind = statusKindFromReturnVisit(visit.status, {
    overdue,
    isToday,
  });

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteReturnVisit(visit.id);
      router.replace("/return-visits?deleted=1");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete this return visit."
      );
      setDeleteBusy(false);
      setDeleting(false);
    }
  };

  // Changes the one existing visit (and its calendar entry) in place - it
  // never creates a second appointment.
  const doReschedule = async () => {
    if (!date) {
      setRescheduleError("Choose a new date.");
      return;
    }
    setRescheduleError(null);
    try {
      await updateReturnVisit(visit.id, {
        scheduled_date: date,
        scheduled_time: time || null,
        preparation_notes: notes.trim() || null,
        general_location: location.trim() || null,
        status: "planned",
      });
      setRescheduling(false);
      setNotice(
        `Rescheduled to ${formatDisplayDate(date)}${time ? ` · ${time}` : ""}.`
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // e.g. this person already has a visit at that date and time.
      setRescheduleError(
        formatDbError(
          "reschedule return visit",
          err,
          "Could not reschedule this visit."
        )
      );
    }
  };
  const reschedule = () => guard(doReschedule);

  const completed = visit.status === "completed";
  const visitNotes = visitNotesFor(visit, conversations);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={person?.name || "Return visit"}
        subtitle={`${formatDisplayDate(visit.scheduled_date)}${
          visit.scheduled_time ? ` · ${visit.scheduled_time}` : ""
        }`}
        action={
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge kind={statusKind} />
            <InterestBadge level={person?.interest_level} />
          </div>
        }
      />

      {notice && (
        <SuccessBanner onDismiss={() => setNotice(null)}>{notice}</SuccessBanner>
      )}

      {completed ? (
        <Card className="space-y-4 ring-emerald-100/80">
          <Block
            label="Topic discussed"
            value={visitNotes?.main_topic || visit.next_planned_topic}
          />
          <Block
            label="Visit notes"
            value={
              visitNotes?.summary ||
              (visitNotes ? null : "No notes were added for this visit.")
            }
          />
          <Block
            label="Preparation for this visit"
            value={visit.preparation_notes}
          />
          <Block label="Location" value={visit.general_location} />
        </Card>
      ) : (
      <Card className="space-y-4 ring-violet-100/80">
        <Block
          label="Previous conversation summary"
          value={conversation?.summary || visit.last_topic}
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Scriptures previously discussed
          </p>
          {conversation?.scriptures?.length ? (
            <ScriptureBadgeList
              className="mt-2"
              references={conversation.scriptures.map(
                (s) => s.scripture_reference
              )}
            />
          ) : (
            <p className="mt-1 text-sm text-stone-400">—</p>
          )}
        </div>
        <Block
          label="Unresolved questions"
          value={visit.question_to_answer || conversation?.questions_asked}
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Planned next topic
          </p>
          {visit.next_planned_topic ? (
            <div className="mt-2">
              <TopicBadge topic={visit.next_planned_topic} tone="amber" />
            </div>
          ) : (
            <p className="mt-1 text-sm text-stone-400">—</p>
          )}
        </div>
        <Block
          label="Preparation notes"
          value={visit.preparation_notes || conversation?.next_visit_preparation}
        />
        <Block label="Location" value={visit.general_location} />
        {person?.location_lat != null && person?.location_lng != null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${person.location_lat},${person.location_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="-mt-2 inline-flex text-xs font-medium text-emerald-800 underline decoration-emerald-200 underline-offset-2"
          >
            Reopen pinned location in Maps
          </a>
        )}
      </Card>
      )}

      {person?.phone_number && (
        <WhatsAppButton phoneNumber={person.phone_number} personName={person.name} />
      )}

      {person && <PersonPhotoGallery personId={person.id} readOnly />}

      <div className="space-y-2">
        {visit.status === "planned" && (
          <>
            <Link href={`/return-visits/${visit.id}/complete`} className="block">
              <Button className="w-full">Mark completed</Button>
            </Link>
            <Link
              href={`/conversations/record?personId=${visit.person_id}&returnVisitId=${visit.id}`}
              className="block"
            >
              <Button variant="record" className="w-full">
                Record new conversation
              </Button>
            </Link>
            <Link
              href={`/bible-studies/new?personId=${visit.person_id}&returnVisitId=${visit.id}`}
              className="block"
            >
              <Button className="w-full bg-amber-700 hover:bg-amber-800">
                Convert to Bible Study
              </Button>
            </Link>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setDate(visit.scheduled_date);
                setTime(visit.scheduled_time || "");
                setNotes(visit.preparation_notes || "");
                setLocation(visit.general_location || "");
                setRescheduleError(null);
                setRescheduling(true);
              }}
            >
              Reschedule
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
        <Button
          variant="ghost"
          className="w-full text-rose-700"
          onClick={() => setDeleting(true)}
        >
          Delete Return Visit
        </Button>
        {deleteError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {deleteError}
          </p>
        )}
      </div>

      <Sheet
        open={rescheduling}
        title="Reschedule visit"
        subtitle="This changes the existing visit. It will not add a second one."
        onClose={() => setRescheduling(false)}
      >
        <Input
          label="New date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TimeField label="Time" value={time} onChange={setTime} />
        <LocationField value={location} onChange={setLocation} />
        <Textarea
          label="Preparation notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {rescheduleError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {rescheduleError}
          </p>
        )}
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
      </Sheet>

      <ConfirmDialog
        open={deleting}
        title={`Delete this return visit${person?.name ? ` with ${person.name}` : ""}?`}
        message={`This removes it from your active list. It won't delete ${person?.name || "the person"}'s profile or any conversation history.`}
        confirmLabel={deleteBusy ? "Deleting…" : "Delete Return Visit"}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(false)}
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
