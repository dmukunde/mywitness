"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApp } from "@/lib/app-context";
import { BibleStudyForm } from "@/components/BibleStudyForm";
import { PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/utils";
import { parseLessonNumber } from "@/lib/bible-study";

function NewBibleStudyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { people, returnVisits, saveBibleStudy } = useApp();

  const personId = searchParams.get("personId") || "";
  const returnVisitId = searchParams.get("returnVisitId") || "";
  const rv = returnVisits.find((r) => r.id === returnVisitId);
  const person = people.find(
    (p) => p.id === personId || p.id === rv?.person_id
  );

  const initial = {
    person_id: person?.id || personId || "",
    publication: person?.current_discussion_theme || "",
    current_lesson: "Lesson 1",
    starting_lesson: "Lesson 1",
    current_lesson_number: 1,
    total_lessons: 60,
    preferred_day: "",
    preferred_time: rv?.scheduled_time || person?.preferred_contact_time || "",
    first_study_date: todayISO(),
    next_study_date: rv?.scheduled_date || "",
    next_study_time: rv?.scheduled_time || "",
    general_location:
      rv?.general_location || person?.general_location || "",
    preparation_notes: rv?.preparation_notes || "",
    private_notes: person?.private_notes || "",
    source_return_visit_id: returnVisitId,
    status: "active" as const,
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Add Bible Study"
        subtitle={
          person
            ? `For ${person.name} — existing person kept as one record`
            : "Link to an existing person"
        }
      />
      <BibleStudyForm
        people={people}
        initial={initial}
        submitLabel="Start Bible Study"
        onCancel={() => router.back()}
        onSubmit={async (form, opts) => {
          const lessonNum =
            form.current_lesson_number ||
            parseLessonNumber(form.current_lesson) ||
            1;
          const study = await saveBibleStudy(
            { ...form, current_lesson_number: lessonNum },
            undefined,
            opts
          );
          router.replace(`/bible-studies/${study.id}`);
        }}
      />
    </div>
  );
}

export default function NewBibleStudyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <NewBibleStudyInner />
    </Suspense>
  );
}
