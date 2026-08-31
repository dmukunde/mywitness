"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  BookMarked,
  BookOpen,
  Church,
  NotebookPen,
  Users,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Card, PageHeader } from "@/components/ui";
import { StudyNoteEditor } from "@/components/StudyNoteEditor";
import {
  EMPTY_STUDY_NOTE_FORM,
  STUDY_NOTE_TYPE_LABELS,
  STUDY_NOTE_TYPES,
  type StudyNoteType,
} from "@/lib/types";
import { todayISO } from "@/lib/utils";

const TYPE_ICONS: Record<StudyNoteType, typeof BookOpen> = {
  family_worship: Users,
  midweek_meeting: BookOpen,
  weekend_meeting: Church,
  convention: Sparkles,
  personal_study: BookMarked,
  other: NotebookPen,
};

function NewStudyNoteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { saveStudyNote } = useApp();
  const presetType = searchParams.get("type") as StudyNoteType | null;
  const [noteType, setNoteType] = useState<StudyNoteType | null>(
    presetType && STUDY_NOTE_TYPES.includes(presetType) ? presetType : null
  );

  if (!noteType) {
    return (
      <div className="animate-fade-up space-y-5">
        <PageHeader title="New Note" subtitle="What kind of note is this?" />
        <div className="grid grid-cols-2 gap-3">
          {STUDY_NOTE_TYPES.map((t) => {
            const Icon = TYPE_ICONS[t];
            return (
              <Card
                key={t}
                className="flex flex-col items-center gap-2 py-6 text-center"
                onClick={() => setNoteType(t)}
              >
                <Icon className="h-6 w-6 text-stone-500" />
                <span className="text-sm font-medium text-stone-800">
                  {STUDY_NOTE_TYPE_LABELS[t]}
                </span>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title={STUDY_NOTE_TYPE_LABELS[noteType]}
        subtitle="New note"
      />
      <StudyNoteEditor
        initial={{ ...EMPTY_STUDY_NOTE_FORM, note_type: noteType, note_date: todayISO() }}
        submitLabel="Save Note"
        onCancel={() => router.back()}
        onSubmit={async (form) => {
          const note = await saveStudyNote(form);
          router.replace(`/notebook/${note.id}`);
        }}
      />
    </div>
  );
}

export default function NewStudyNotePage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <NewStudyNoteInner />
    </Suspense>
  );
}
