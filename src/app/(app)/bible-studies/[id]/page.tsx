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
  TimeField,
} from "@/components/ui";
import {
  ScriptureBadgeList,
  StatusBadge,
  TopicBadge,
} from "@/components/badges";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PersonPhotoGallery } from "@/components/PersonPhotoGallery";
import {
  isStudyOverdue,
  studyProgressLabel,
  studyProgressPercent,
} from "@/lib/bible-study";
import { formatDisplayDate, parseScriptures, todayISO } from "@/lib/utils";

export default function BibleStudyProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    bibleStudies,
    studySessions,
    people,
    updateBibleStudyStatus,
    saveBibleStudy,
    archiveBibleStudy,
  } = useApp();

  const study = bibleStudies.find((s) => s.id === params.id);
  const person = study
    ? study.person || people.find((p) => p.id === study.person_id)
    : null;

  const sessions = useMemo(
    () =>
      studySessions
        .filter((s) => s.bible_study_id === params.id)
        .sort((a, b) => b.session_date.localeCompare(a.session_date)),
    [studySessions, params.id]
  );

  const [scheduling, setScheduling] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!study) {
    return (
      <EmptyState
        title="Bible study not found"
        action={
          <Link href="/bible-studies">
            <Button className="bg-amber-700 hover:bg-amber-800">Back</Button>
          </Link>
        }
      />
    );
  }

  const pct = studyProgressPercent(study);
  const overdue = isStudyOverdue(study, todayISO());
  const statusKind =
    study.status === "active"
      ? "study_active"
      : study.status === "paused"
        ? "study_paused"
        : "study_completed";

  const saveNext = async () => {
    if (!nextDate) return;
    await saveBibleStudy(
      {
        person_id: study.person_id,
        publication: study.publication,
        starting_lesson: study.starting_lesson || "",
        current_lesson: study.current_lesson || "",
        current_lesson_number: study.current_lesson_number,
        total_lessons: study.total_lessons,
        study_frequency: study.study_frequency,
        preferred_day: study.preferred_day || "",
        preferred_time: study.preferred_time || "",
        first_study_date: study.first_study_date || "",
        next_study_date: nextDate,
        next_study_time: nextTime,
        general_location: study.general_location || "",
        location_lat: person?.location_lat ?? null,
        location_lng: person?.location_lng ?? null,
        status: study.status,
        preparation_notes: study.preparation_notes || "",
        private_notes: study.private_notes || "",
        source_return_visit_id: study.source_return_visit_id || "",
      },
      study.id
    );
    setScheduling(false);
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await archiveBibleStudy(study.id);
      router.replace("/bible-studies?deleted=1");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete this Bible study."
      );
      setDeleteBusy(false);
      setDeleting(false);
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title={person?.name || "Bible Study"}
        subtitle={study.publication}
        accent="gold"
        action={
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge kind={statusKind} />
            {overdue && <StatusBadge kind="overdue" />}
          </div>
        }
      />

      <Card className="space-y-3 ring-amber-100">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-amber-950">
            {studyProgressLabel(study)}
          </p>
          <p className="text-sm font-semibold text-amber-900">{pct}% complete</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-amber-100">
          <div
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      <Card className="space-y-2 text-sm ring-amber-50">
        <Row label="Current lesson" value={study.current_lesson} />
        {study.next_study_date ? (
          <Link
            href={`/calendar?date=${study.next_study_date}`}
            className="flex justify-between gap-3"
          >
            <span className="text-stone-500">Next study</span>
            <span className="text-right text-amber-800 underline decoration-amber-200 underline-offset-2">
              {formatDisplayDate(study.next_study_date)}
              {study.next_study_time ? ` · ${study.next_study_time}` : ""}
            </span>
          </Link>
        ) : (
          <Row label="Next study" value={null} />
        )}
        <Row
          label="Last study"
          value={
            study.last_study_date
              ? formatDisplayDate(study.last_study_date)
              : null
          }
        />
        <Row label="Location" value={study.general_location} />
        <Row label="Preparation" value={study.preparation_notes} />
        {study.private_notes && (
          <Row label="Private notes" value={study.private_notes} />
        )}
      </Card>

      {person?.phone_number && (
        <WhatsAppButton phoneNumber={person.phone_number} personName={person.name} />
      )}

      {person && <PersonPhotoGallery personId={person.id} readOnly />}

      <div className="space-y-2">
        <Link href={`/bible-studies/${study.id}/record`} className="block">
          <Button className="w-full bg-amber-700 hover:bg-amber-800">
            Record study by voice
          </Button>
        </Link>
        <Link href={`/bible-studies/${study.id}/session`} className="block">
          <Button variant="secondary" className="w-full">
            Write study notes
          </Button>
        </Link>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            setNextDate(study.next_study_date || "");
            setNextTime(study.next_study_time || "");
            setScheduling(true);
          }}
        >
          {overdue ? "Reschedule study" : "Schedule next study"}
        </Button>
        {study.status === "active" && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => void updateBibleStudyStatus(study.id, "paused")}
          >
            Pause study
          </Button>
        )}
        {study.status === "paused" && (
          <Button
            variant="ghost"
            className="w-full text-amber-800"
            onClick={() => void updateBibleStudyStatus(study.id, "active")}
          >
            Resume study
          </Button>
        )}
        {study.status !== "completed" && (
          <Button
            variant="ghost"
            className="w-full text-emerald-800"
            onClick={() => void updateBibleStudyStatus(study.id, "completed")}
          >
            Mark study completed
          </Button>
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
          Delete Bible Study
        </Button>
        {deleteError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {deleteError}
          </p>
        )}
      </div>

      {scheduling && (
        <Card className="space-y-3 ring-amber-100">
          <Input
            label="Next study date"
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />
          <TimeField label="Time" value={nextTime} onChange={setNextTime} />
          <Button
            className="w-full bg-amber-700 hover:bg-amber-800"
            onClick={() => void saveNext()}
          >
            Save schedule
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setScheduling(false)}
          >
            Cancel
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={deleting}
        title={`Delete this Bible study${person?.name ? ` with ${person.name}` : ""}?`}
        message={
          sessions.length > 0
            ? `This hides it from your active list. It won't delete ${person?.name || "the person"}'s profile, and all ${sessions.length} study session record${sessions.length === 1 ? "" : "s"} and notes stay in your history — you just won't see it in active studies anymore.`
            : `This hides it from your active list. It won't delete ${person?.name || "the person"}'s profile or any of their conversation history.`
        }
        confirmLabel={deleteBusy ? "Deleting…" : "Delete Bible Study"}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(false)}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-900/70">
          Study session timeline
        </h2>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions recorded yet" />
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Card key={s.id} className="ring-amber-50">
                <p className="text-xs font-medium text-stone-500">
                  {formatDisplayDate(s.session_date)}
                </p>
                {(s.start_lesson || s.end_lesson) && (
                  <p className="mt-2 text-sm font-medium text-amber-950">
                    {[s.start_lesson, s.end_lesson].filter(Boolean).join(" → ")}
                  </p>
                )}
                {s.topics_discussed && (
                  <div className="mt-2">
                    <TopicBadge topic={s.topics_discussed} />
                  </div>
                )}
                {s.summary && (
                  <p className="mt-2 text-sm text-stone-700">{s.summary}</p>
                )}
                {s.scriptures_discussed && (
                  <ScriptureBadgeList
                    className="mt-2"
                    references={parseScriptures(s.scriptures_discussed)}
                  />
                )}
                {s.questions_raised && (
                  <p className="mt-2 text-xs text-stone-500">
                    Questions: {s.questions_raised}
                  </p>
                )}
                {s.homework && (
                  <p className="mt-1 text-xs text-stone-500">
                    Homework: {s.homework}
                  </p>
                )}
                {s.next_lesson && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-stone-500">Next:</span>
                    <TopicBadge topic={s.next_lesson} tone="amber" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <Button variant="ghost" className="w-full" onClick={() => router.back()}>
        Back
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-stone-500">{label}</span>
      <span className="max-w-[60%] text-right text-stone-800">
        {value || "—"}
      </span>
    </div>
  );
}
