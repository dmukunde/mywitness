"use client";

import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { StudySessionForm } from "@/components/StudySessionForm";
import { EmptyState, PageHeader, Button } from "@/components/ui";
import Link from "next/link";
import { todayISO } from "@/lib/utils";

export default function WriteStudySessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { bibleStudies, saveStudySession } = useApp();
  const study = bibleStudies.find((s) => s.id === params.id);

  if (!study) {
    return (
      <EmptyState
        title="Bible study not found"
        action={
          <Link href="/bible-studies">
            <Button>Back</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Write study notes"
        subtitle={study.publication}
      />
      <StudySessionForm
        initial={{
          bible_study_id: study.id,
          session_date: todayISO(),
          start_lesson: study.current_lesson || "",
          end_lesson: study.current_lesson || "",
          next_lesson: "",
          source: "manual",
        }}
        onCancel={() => router.back()}
        onSubmit={async (form) => {
          await saveStudySession({ ...form, bible_study_id: study.id });
          router.replace(`/bible-studies/${study.id}`);
        }}
      />
    </div>
  );
}
