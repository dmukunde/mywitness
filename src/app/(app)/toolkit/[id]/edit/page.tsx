"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { ToolkitEntryForm } from "@/components/ToolkitEntryForm";
import { toolkitCategories, toolkitEntryToForm } from "@/lib/toolkit";

export default function EditToolkitEntryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toolkitEntries, saveToolkitEntry } = useApp();
  const entry = toolkitEntries.find((e) => e.id === params.id);

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

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title="Edit entry" />
      <ToolkitEntryForm
        key={entry.id}
        initial={toolkitEntryToForm(entry)}
        categories={toolkitCategories(toolkitEntries)}
        submitLabel="Save changes"
        onSubmit={async (form) => {
          await saveToolkitEntry(form, entry.id);
          router.replace(`/toolkit/${entry.id}`);
        }}
        onCancel={() => router.back()}
      />
    </div>
  );
}
