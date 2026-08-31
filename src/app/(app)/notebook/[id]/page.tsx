"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { ScriptureBadgeList } from "@/components/badges";
import { StudyNoteEditor } from "@/components/StudyNoteEditor";
import { STUDY_NOTE_TYPE_LABELS, type StudyNoteFormData } from "@/lib/types";
import { formatDisplayDate, parseScriptures } from "@/lib/utils";
import { parseReferenceLines } from "@/lib/study-notes";

export default function StudyNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { studyNotes, saveStudyNote, archiveStudyNote } = useApp();
  const note = studyNotes.find((n) => n.id === params.id);

  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  if (!note) {
    return (
      <EmptyState
        title="Note not found"
        action={
          <Link href="/notebook">
            <Button>Back to Notebook</Button>
          </Link>
        }
      />
    );
  }

  const confirmArchive = async () => {
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      await archiveStudyNote(note.id);
      router.replace("/notebook?archived=1");
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Could not archive this note."
      );
      setArchiveBusy(false);
      setArchiving(false);
    }
  };

  if (editing) {
    const initial: StudyNoteFormData = {
      note_type: note.note_type,
      title: note.title,
      session_label: note.session_label || "",
      note_date: note.note_date,
      scripture_refs: note.scripture_refs || "",
      references_text: note.references_text || "",
      body: note.body || "",
      is_comment: note.is_comment,
    };
    return (
      <div className="animate-fade-up space-y-5">
        <PageHeader title="Edit Note" />
        <StudyNoteEditor
          initial={initial}
          submitLabel="Save Changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (form) => {
            await saveStudyNote(form, note.id);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  const referenceLines = parseReferenceLines(note.references_text);
  const scriptures = parseScriptures(note.scripture_refs || "");

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title={note.title}
        subtitle={`${STUDY_NOTE_TYPE_LABELS[note.note_type]} · ${formatDisplayDate(note.note_date)}`}
        action={
          note.is_comment ? (
            <Star className="h-6 w-6 shrink-0 fill-amber-500 text-amber-500" />
          ) : undefined
        }
      />

      {note.session_label && (
        <Card className="text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Section
          </p>
          <p className="mt-1 text-stone-800">{note.session_label}</p>
        </Card>
      )}

      {scriptures.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
            Scriptures
          </p>
          <ScriptureBadgeList references={scriptures} />
        </Card>
      )}

      {referenceLines.length > 0 && (
        <Card className="space-y-1.5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">
            Research / References
          </p>
          {referenceLines.map((line, i) =>
            line.url ? (
              <a
                key={i}
                href={line.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-emerald-800 underline decoration-emerald-200 underline-offset-2"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{line.text}</span>
              </a>
            ) : (
              <p key={i} className="text-sm text-stone-700">
                {line.text}
              </p>
            )
          )}
        </Card>
      )}

      {note.body && (
        <Card>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
            My Notes
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
            {note.body}
          </p>
        </Card>
      )}

      <div className="space-y-2">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() =>
            window.open("https://www.jw.org", "_blank", "noopener,noreferrer")
          }
        >
          <ExternalLink className="h-4 w-4" />
          Open JW.org
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setEditing(true)}>
          Edit Note
        </Button>
        <Button
          variant="ghost"
          className="w-full text-rose-700"
          onClick={() => setArchiving(true)}
        >
          Archive Note
        </Button>
        {archiveError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {archiveError}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={archiving}
        title="Archive this note?"
        message="This hides it from your notebook. It is not permanently deleted."
        confirmLabel={archiveBusy ? "Archiving…" : "Archive Note"}
        danger
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiving(false)}
      />

      <Button variant="ghost" className="w-full" onClick={() => router.back()}>
        Back
      </Button>
    </div>
  );
}
