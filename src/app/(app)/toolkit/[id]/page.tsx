"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { ScriptureLinks } from "@/components/ScriptureLinks";
import { formatDbError } from "@/lib/db-errors";
import { TOOLKIT_KIND_SINGULAR } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ToolkitEntryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    toolkitEntries,
    toggleToolkitFavorite,
    markToolkitEntryUsed,
    deleteToolkitEntry,
  } = useApp();
  const entry = toolkitEntries.find((e) => e.id === params.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening an entry is what puts it in "Recently used" — once per visit.
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!entry || marked.current === entry.id) return;
    marked.current = entry.id;
    void markToolkitEntryUsed(entry.id);
  }, [entry, markToolkitEntryUsed]);

  if (!entry) {
    return (
      <EmptyState
        title="Entry not found"
        action={
          <Link href="/toolkit">
            <Button>Back to toolkit</Button>
          </Link>
        }
      />
    );
  }

  const star = async () => {
    setError(null);
    try {
      await toggleToolkitFavorite(entry.id);
    } catch (err) {
      setError(formatDbError("update favorite", err, "Could not update favorites."));
    }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteToolkitEntry(entry.id);
      router.replace(`/toolkit?kind=${entry.kind}&deleted=1`);
    } catch (err) {
      setError(formatDbError("delete entry", err, "Could not delete this entry."));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title={entry.title}
        subtitle={[TOOLKIT_KIND_SINGULAR[entry.kind], entry.category]
          .filter(Boolean)
          .join(" · ")}
        action={
          <button
            type="button"
            onClick={() => void star()}
            aria-label={
              entry.is_favorite ? "Remove from favorites" : "Add to favorites"
            }
            aria-pressed={entry.is_favorite}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-300 transition hover:bg-stone-100"
          >
            <Star
              className={cn(
                "h-6 w-6",
                entry.is_favorite && "fill-amber-500 text-amber-500"
              )}
            />
          </button>
        }
      />

      {entry.explanation && (
        <Card>
          <p className="whitespace-pre-line text-base leading-relaxed text-stone-800">
            {entry.explanation}
          </p>
        </Card>
      )}

      {entry.scripture_refs.length > 0 && (
        <Section title="Scriptures">
          <ScriptureLinks references={entry.scripture_refs} />
          <p className="mt-2 text-xs text-stone-400">
            Opens the passage on JW.org.
          </p>
        </Section>
      )}

      {entry.suggested_response && (
        <Section title="My suggested response">
          <p className="whitespace-pre-line text-base leading-relaxed text-stone-800">
            {entry.suggested_response}
          </p>
        </Section>
      )}

      {entry.follow_up_questions.length > 0 && (
        <Section title="Follow-up questions">
          <ul className="space-y-2">
            {entry.follow_up_questions.map((q, i) => (
              <li
                key={`${i}-${q}`}
                className="rounded-xl bg-stone-50 px-3.5 py-2.5 text-base text-stone-800"
              >
                {q}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {entry.personal_notes && (
        <Section title="My notes">
          <p className="whitespace-pre-line text-sm leading-relaxed text-stone-600">
            {entry.personal_notes}
          </p>
        </Section>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Link href={`/toolkit/${entry.id}/edit`} className="block">
          <Button variant="secondary" className="w-full">
            Edit
          </Button>
        </Link>
        <Button
          variant="ghost"
          className="w-full text-rose-700"
          onClick={() => setConfirmDelete(true)}
        >
          Delete entry
        </Button>
        <Link href={`/toolkit?kind=${entry.kind}`} className="block">
          <Button variant="ghost" className="w-full">
            Back to toolkit
          </Button>
        </Link>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        message="It will be removed from your toolkit for good. This can't be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
        {title}
      </h2>
      {children}
    </section>
  );
}
