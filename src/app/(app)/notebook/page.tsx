"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Star } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { SuccessBanner } from "@/components/badges";
import { searchStudyNotes } from "@/lib/study-notes";
import { STUDY_NOTE_TYPE_LABELS, STUDY_NOTE_TYPES } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils";

type FilterKey = "all" | (typeof STUDY_NOTE_TYPES)[number];

function StudyNotebookInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { studyNotes } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const archivedBanner =
    !dismissedBanner && searchParams.get("archived") === "1"
      ? "Note archived."
      : null;

  const filtered = useMemo(() => {
    let list =
      filter === "all"
        ? studyNotes
        : studyNotes.filter((n) => n.note_type === filter);
    list = searchStudyNotes(list, query);
    return [...list].sort((a, b) => b.note_date.localeCompare(a.note_date));
  }, [studyNotes, filter, query]);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Study Notebook"
        subtitle="Your own preparation, comments, and notes"
        action={
          <Link href="/notebook/new">
            <Button size="sm" className="whitespace-nowrap">
              <Plus className="h-4 w-4" />
              New Note
            </Button>
          </Link>
        }
      />

      {archivedBanner && (
        <SuccessBanner
          onDismiss={() => {
            setDismissedBanner(true);
            router.replace("/notebook", { scroll: false });
          }}
        >
          {archivedBanner}
        </SuccessBanner>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, scriptures, references…"
            className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterKey)}
        >
          <option value="all">All note types</option>
          {STUDY_NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {STUDY_NOTE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={studyNotes.length === 0 ? "No notes yet" : "No matching notes"}
          description={
            studyNotes.length === 0
              ? "Prepare for Family Worship, a meeting, or a convention — and find it again later."
              : "Try a different search or filter."
          }
          action={
            studyNotes.length === 0 ? (
              <Link href="/notebook/new">
                <Button>New Note</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((note) => (
            <Link key={note.id} href={`/notebook/${note.id}`}>
              <Card className="mb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
                      {STUDY_NOTE_TYPE_LABELS[note.note_type]} ·{" "}
                      {formatDisplayDate(note.note_date)}
                    </p>
                    <p className="mt-1 truncate font-medium text-stone-900">
                      {note.title}
                    </p>
                    {note.session_label && (
                      <p className="mt-1 text-sm text-stone-500">
                        {note.session_label}
                      </p>
                    )}
                  </div>
                  {note.is_comment && (
                    <Star className="h-5 w-5 shrink-0 fill-amber-500 text-amber-500" />
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StudyNotebookPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <StudyNotebookInner />
    </Suspense>
  );
}
