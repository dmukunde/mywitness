"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ConversationForm } from "@/components/ConversationForm";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { EMPTY_CONVERSATION_FORM, type ConversationFormData } from "@/lib/types";
import { todayISO } from "@/lib/utils";

function NewConversationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { people, saveConversation, activeSession } = useApp();
  const personId = searchParams.get("personId") || "";
  const person = people.find((p) => p.id === personId);

  const initial: Partial<ConversationFormData> = {
    ...EMPTY_CONVERSATION_FORM,
    person_id: personId,
    person_name: person?.name || "",
    conversation_date: todayISO(),
    general_location: person?.general_location || "",
    source: "manual",
    session_id: activeSession?.id || "",
  };

  const onSubmit = async (form: ConversationFormData) => {
    await saveConversation(form);
    router.replace("/today?saved=1");
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Write Notes"
        subtitle="Type conversation notes manually"
      />
      <ConversationForm
        initial={initial}
        people={people}
        onSubmit={onSubmit}
        onCancel={() => router.back()}
      />
    </div>
  );
}

export default function NewConversationPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <NewConversationInner />
    </Suspense>
  );
}
