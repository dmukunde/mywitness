"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { StudySessionForm } from "@/components/StudySessionForm";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { mapExtractionToStudySession } from "@/lib/ai/study-extraction";
import { scripturesToString, todayISO } from "@/lib/utils";
import type { BibleStudySessionFormData } from "@/lib/types";

function isProcessing(status: string) {
  return (
    status === "uploading" ||
    status === "transcribing" ||
    status === "extracting"
  );
}

export default function RecordStudySessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { bibleStudies, saveStudySession, demoMode, people } = useApp();
  const study = bibleStudies.find((s) => s.id === params.id);
  const person = study
    ? people.find((p) => p.id === study.person_id)
    : null;

  const [form, setForm] = useState<BibleStudySessionFormData | null>(null);
  const processRef = useRef<(blob: Blob) => Promise<void>>(async () => {});

  const {
    status,
    setStatus,
    durationLabel,
    error,
    setError,
    start,
    pause,
    resume,
    cancel,
    finish,
  } = useVoiceRecorder({
    onComplete: (blob) => {
      void processRef.current(blob);
    },
  });

  useEffect(() => {
    processRef.current = async (blob: Blob) => {
      if (!study) return;
      try {
        if (demoMode) {
          setStatus("transcribing");
          await new Promise((r) => setTimeout(r, 500));
          setStatus("extracting");
          await new Promise((r) => setTimeout(r, 600));
          const mapped = mapExtractionToStudySession({
            start_lesson: study.current_lesson || "Lesson 1",
            end_lesson: "Lesson 2",
            topics_discussed: "God’s purpose for the earth",
            scriptures_discussed: ["Psalm 37:29", "Isaiah 65:21-23"],
            questions_raised: ["Will we really live forever on earth?"],
            material_completed: "Paragraphs 1-8",
            homework: "Read paragraphs 9-15",
            next_lesson: "Lesson 2",
            proposed_return_visit_date_phrase: "next Tuesday",
            proposed_return_visit_time: "10:00 AM",
            summary: `Studied with ${person?.name || "the student"}. Covered the opening paragraphs and answered a question about living forever on earth.`,
          });
          setForm({
            bible_study_id: study.id,
            session_date: todayISO(),
            start_lesson: mapped.start_lesson,
            end_lesson: mapped.end_lesson,
            topics_discussed: mapped.topics_discussed,
            scriptures_discussed: scripturesToString(
              mapped.scriptures_discussed
            ),
            questions_raised: mapped.questions_raised.join("; "),
            material_completed: mapped.material_completed,
            homework: mapped.homework,
            next_lesson: mapped.next_lesson,
            next_scheduled_date: mapped.next_scheduled_date || "",
            next_scheduled_time: mapped.next_scheduled_time,
            preparation_notes: mapped.preparation_notes,
            summary: mapped.summary,
            source: "voice",
            transcript:
              "We studied lesson one about God’s purpose. She asked if we will live forever on earth. We read Psalm 37:29. Next Tuesday at 10 we will continue with lesson two.",
            audio_path: "",
          });
          setStatus("complete");
          return;
        }

        setStatus("uploading");
        const fd = new FormData();
        fd.append("audio", blob, `study-${Date.now()}.webm`);
        fd.append("personId", study.person_id);
        fd.append("localDate", todayISO());
        fd.append(
          "timezone",
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        );
        setStatus("transcribing");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Transcription failed");
        }
        setStatus("extracting");
        const data = (await res.json()) as {
          transcript: string;
          extraction: Record<string, unknown>;
          audioPath?: string;
        };
        const mapped = mapExtractionToStudySession({
          ...data.extraction,
          start_lesson: study.current_lesson || "",
        });
        setForm({
          bible_study_id: study.id,
          session_date: todayISO(),
          start_lesson: mapped.start_lesson || study.current_lesson || "",
          end_lesson: mapped.end_lesson,
          topics_discussed: mapped.topics_discussed,
          scriptures_discussed: scripturesToString(mapped.scriptures_discussed),
          questions_raised: mapped.questions_raised.join("; "),
          material_completed: mapped.material_completed,
          homework: mapped.homework,
          next_lesson: mapped.next_lesson,
          next_scheduled_date: mapped.next_scheduled_date || "",
          next_scheduled_time: mapped.next_scheduled_time,
          preparation_notes: mapped.preparation_notes,
          summary: mapped.summary,
          source: "voice",
          transcript: data.transcript || "",
          audio_path: data.audioPath || "",
        });
        setStatus("complete");
      } catch (err) {
        setStatus("failed");
        setError(err instanceof Error ? err.message : "Recording failed");
      }
    };
  }, [demoMode, person?.name, setError, setStatus, study]);

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

  if (form) {
    return (
      <div className="animate-fade-up space-y-5">
        <PageHeader
          title="Review study session"
          subtitle="Confirm progress, then save"
          accent="gold"
        />
        <StudySessionForm
          initial={form}
          submitLabel="Save study session"
          onCancel={() => {
            setForm(null);
            setStatus("idle");
          }}
          onSubmit={async (sessionForm) => {
            await saveStudySession({
              ...sessionForm,
              bible_study_id: study.id,
              source: "voice",
            });
            router.replace(`/bible-studies/${study.id}`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Record study session"
        subtitle={`${person?.name || "Student"} · ${study.publication}`}
        accent="gold"
      />

      <Card className="flex flex-col items-center py-10 ring-amber-100">
        <div className="relative flex h-28 w-28 items-center justify-center">
          {(status === "recording" || status === "paused") && (
            <span className="recording-pulse absolute inset-0" />
          )}
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-full ${
              status === "recording"
                ? "bg-rose-600 text-white"
                : status === "paused"
                  ? "bg-amber-500 text-white"
                  : "bg-amber-700 text-white"
            }`}
          >
            {isProcessing(status) ? (
              <Loader2 className="h-10 w-10 animate-spin" />
            ) : status === "failed" ? (
              <AlertCircle className="h-10 w-10" />
            ) : status === "complete" ? (
              <CheckCircle2 className="h-10 w-10" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </div>
        </div>
        <p className="mt-6 font-display text-4xl font-semibold tracking-tight text-stone-900">
          {durationLabel}
        </p>
        <p className="mt-2 text-sm text-stone-500">
          {status === "idle" && "Tap record when the study begins"}
          {status === "recording" && "Recording…"}
          {status === "paused" && "Paused"}
          {isProcessing(status) && "Processing with AI…"}
          {status === "failed" && "Something went wrong"}
        </p>
      </Card>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {status === "idle" || status === "failed" ? (
          <Button
            className="w-full bg-amber-700 hover:bg-amber-800"
            onClick={() => void start()}
          >
            <Mic className="h-5 w-5" />
            Start recording
          </Button>
        ) : null}
        {status === "recording" && (
          <>
            <Button variant="secondary" className="flex-1" onClick={pause}>
              <Pause className="h-5 w-5" />
              Pause
            </Button>
            <Button
              className="flex-1 bg-amber-700 hover:bg-amber-800"
              onClick={finish}
            >
              <Square className="h-5 w-5" />
              Stop
            </Button>
          </>
        )}
        {status === "paused" && (
          <>
            <Button variant="secondary" className="flex-1" onClick={resume}>
              <Play className="h-5 w-5" />
              Resume
            </Button>
            <Button
              className="flex-1 bg-amber-700 hover:bg-amber-800"
              onClick={finish}
            >
              <Square className="h-5 w-5" />
              Stop
            </Button>
          </>
        )}
      </div>

      <Button
        variant="ghost"
        className="w-full"
        onClick={() => {
          cancel();
          router.back();
        }}
      >
        Cancel
      </Button>
    </div>
  );
}
