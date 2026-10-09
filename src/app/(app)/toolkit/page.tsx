"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Star } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { SuccessBanner } from "@/components/badges";
import {
  favoriteEntries,
  recentEntries,
  searchToolkit,
  sortToolkit,
  toolkitCategories,
} from "@/lib/toolkit";
import {
  TOOLKIT_KINDS,
  TOOLKIT_KIND_LABELS,
  TOOLKIT_KIND_SINGULAR,
  type ToolkitEntry,
  type ToolkitKind,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function isKind(value: string | null): value is ToolkitKind {
  return !!value && (TOOLKIT_KINDS as string[]).includes(value);
}

function ToolkitInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toolkitEntries, toggleToolkitFavorite } = useApp();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const kindParam = searchParams.get("kind");
  const deletedBanner =
    !dismissedBanner && searchParams.get("deleted") === "1"
      ? "Entry deleted."
      : null;

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TOOLKIT_KINDS.map((k) => [
          k,
          toolkitEntries.filter((e) => e.kind === k).length,
        ])
      ) as Record<ToolkitKind, number>,
    [toolkitEntries]
  );

  // With no tab chosen yet, open on the first one that has something in it,
  // so a lone Starter isn't hidden behind an empty FAQs tab.
  const kind: ToolkitKind = isKind(kindParam)
    ? kindParam
    : (TOOLKIT_KINDS.find((k) => counts[k] > 0) ?? "faq");

  const categories = useMemo(
    () => toolkitCategories(toolkitEntries, kind),
    [toolkitEntries, kind]
  );

  const searching = query.trim().length > 0;

  // Searching looks across everything; otherwise the list is the open tab.
  const visible = useMemo(() => {
    let list = searching
      ? searchToolkit(toolkitEntries, query)
      : toolkitEntries.filter((e) => e.kind === kind);
    if (!searching && category) {
      list = list.filter(
        (e) => e.category?.trim().toLowerCase() === category.toLowerCase()
      );
    }
    return sortToolkit(list);
  }, [toolkitEntries, query, searching, kind, category]);

  const favorites = useMemo(() => favoriteEntries(toolkitEntries), [toolkitEntries]);
  const recents = useMemo(() => recentEntries(toolkitEntries, 5), [toolkitEntries]);

  const setKind = (k: ToolkitKind) => {
    setCategory(null);
    router.replace(`/toolkit?kind=${k}`, { scroll: false });
  };

  const star = async (e: ToolkitEntry) => {
    try {
      await toggleToolkitFavorite(e.id);
    } catch {
      window.alert("Could not update favorites. Please try again.");
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="My Teaching Toolkit"
        subtitle="Your own quick-reference library"
        action={
          <Link href={`/toolkit/new?kind=${kind}`}>
            <Button size="sm" className="whitespace-nowrap">
              <Plus className="h-4 w-4" />
              New
            </Button>
          </Link>
        }
      />

      {deletedBanner && (
        <SuccessBanner
          onDismiss={() => {
            setDismissedBanner(true);
            router.replace(`/toolkit?kind=${kind}`, { scroll: false });
          }}
        >
          {deletedBanner}
        </SuccessBanner>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions, scriptures, notes…"
          aria-label="Search the toolkit"
          className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </div>

      {!searching && (favorites.length > 0 || recents.length > 0) && (
        <div className="space-y-4">
          {favorites.length > 0 && (
            <QuickRow title="Favorites" entries={favorites} />
          )}
          {recents.length > 0 && (
            <QuickRow title="Recently used" entries={recents} />
          )}
        </div>
      )}

      {!searching && (
        <div
          role="tablist"
          aria-label="Toolkit sections"
          className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1"
        >
          {TOOLKIT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "min-h-11 rounded-xl px-2 text-sm font-semibold transition",
                kind === k
                  ? "bg-white text-emerald-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              )}
            >
              {TOOLKIT_KIND_LABELS[k]}
              <span className="ml-1 text-xs font-medium text-stone-400">
                {counts[k]}
              </span>
            </button>
          ))}
        </div>
      )}

      {!searching && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "min-h-9 rounded-full px-3 text-xs font-semibold ring-1 transition",
                category === c
                  ? "bg-emerald-700 text-white ring-emerald-700"
                  : "bg-white text-stone-600 ring-stone-200"
              )}
            >
              {c ?? "All"}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={
            searching
              ? "Nothing matches that search"
              : toolkitEntries.length === 0
                ? "Your toolkit is empty"
                : `Nothing in ${TOOLKIT_KIND_LABELS[kind]} yet`
          }
          description={
            searching
              ? "Try a different word."
              : "Add the questions, scriptures and openers you want close at hand."
          }
          action={
            searching ? undefined : (
              <Link href={`/toolkit/new?kind=${kind}`}>
                <Button>Add {TOOLKIT_KIND_SINGULAR[kind]}</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              showKind={searching}
              onStar={() => void star(e)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  showKind,
  onStar,
}: {
  entry: ToolkitEntry;
  showKind: boolean;
  onStar: () => void;
}) {
  return (
    <div className="relative">
      <Link href={`/toolkit/${entry.id}`} className="block">
        <Card className="pr-14">
          {(showKind || entry.category) && (
            <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
              {[showKind ? TOOLKIT_KIND_SINGULAR[entry.kind] : null, entry.category]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <p className="mt-0.5 font-medium text-stone-900">{entry.title}</p>
          {entry.explanation && (
            <p className="mt-1 line-clamp-2 text-sm text-stone-500">
              {entry.explanation}
            </p>
          )}
          {entry.scripture_refs.length > 0 && (
            <p className="mt-2 truncate text-xs font-medium text-sky-800">
              {entry.scripture_refs.join(" · ")}
            </p>
          )}
        </Card>
      </Link>
      <button
        type="button"
        onClick={onStar}
        aria-label={entry.is_favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={entry.is_favorite}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-stone-300 transition hover:bg-stone-100"
      >
        <Star
          className={cn(
            "h-5 w-5",
            entry.is_favorite && "fill-amber-500 text-amber-500"
          )}
        />
      </button>
    </div>
  );
}

function QuickRow({
  title,
  entries,
}: {
  title: string;
  entries: ToolkitEntry[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
        {title}
      </h2>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {entries.map((e) => (
          <Link
            key={e.id}
            href={`/toolkit/${e.id}`}
            className="min-w-40 max-w-56 shrink-0 snap-start"
          >
            <Card className="h-full">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                {TOOLKIT_KIND_SINGULAR[e.kind]}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm font-medium text-stone-900">
                {e.title}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function ToolkitPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <ToolkitInner />
    </Suspense>
  );
}
