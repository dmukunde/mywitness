"use client";

import { Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { PageHeader } from "@/components/ui";
import { ToolkitEntryForm } from "@/components/ToolkitEntryForm";
import { toolkitCategories } from "@/lib/toolkit";
import { TOOLKIT_KINDS, type ToolkitKind } from "@/lib/types";

function NewToolkitEntryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toolkitEntries, saveToolkitEntry } = useApp();
  // One id per open form: saving twice creates one entry, not two.
  const entryId = useRef<string | null>(null);

  const kindParam = searchParams.get("kind");
  const kind: ToolkitKind = (TOOLKIT_KINDS as string[]).includes(kindParam ?? "")
    ? (kindParam as ToolkitKind)
    : "faq";

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title="New entry" subtitle="Add to your Teaching Toolkit" />
      <ToolkitEntryForm
        initial={{ kind }}
        categories={toolkitCategories(toolkitEntries)}
        submitLabel="Save to toolkit"
        onSubmit={async (form) => {
          entryId.current ??= crypto.randomUUID();
          const entry = await saveToolkitEntry(form, undefined, {
            clientId: entryId.current,
          });
          router.replace(`/toolkit/${entry.id}`);
        }}
        onCancel={() => router.back()}
      />
    </div>
  );
}

export default function NewToolkitEntryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <NewToolkitEntryInner />
    </Suspense>
  );
}
