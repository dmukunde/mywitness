"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Mic,
  Pause,
  Play,
  Square,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { ConversationForm } from "@/components/ConversationForm";
import { Button, Card, PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { useVoiceRecorder, type RecorderStatus } from "@/hooks/useVoiceRecorder";
import {
  EMPTY_CONVERSATION_FORM,
  type ConversationExtraction,
  type ConversationFormData,
} from "@/lib/types";
import {
  getNextSaturdayAfternoon,
  scripturesToString,
  todayISO,
} from "@/lib/utils";

function RecordConversationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { people, saveConversation, activeSession, demoMode } = useApp();
  const personId = searchParams.get("personId") || "";
  const person = people.find((p) => p.id === personId);

  const [form, setForm] = useState<ConversationFormData | null>(null);
  const [uncertainFields, setUncertainFields] = useState<string[]>([]);
  const [audioPath, setAudioPath] = useState("");
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
      try {
        if (demoMode) {
          setStatus("transcribing");
          await delay(600);
          setStatus("extracting");
          await delay(700);
          const saturday = getNextSaturdayAfternoon();
          const extraction: ConversationExtraction = {
            person_name: person?.name || "Joan",
            conversation_date: todayISO(),
            approximate_time: "Afternoon",
            general_location: person?.general_location || "Near the pharmacy",
            how_met: "Informal witnessing",
            main_topic: "Why God allows suffering",
            scriptures: ["James 1:13", "Revelation 21:3, 4"],
            questions_asked: "Does everyone go to heaven?",
            concerns_circumstances: "Recently lost her mother",
            publications_shared: "",
            interest_level: "high",
            promised_follow_up_date: saturday.date,
            promised_follow_up_time: "Afternoon",
            next_topic: "God's Kingdom",
            action_required: "Prepare scriptures about God's Kingdom",
            additional_notes: "",
            summary:
              "Met Joan near the pharmacy. She recently lost her mother and asked why God allows suffering. We discussed James 1:13 and Revelation 21:3, 4. She also asked whether everyone goes to heaven. A return visit was planned for Saturday afternoon to discuss God's Kingdom.",
            next_visit_preparation:
              "Review scriptures about God's Kingdom and gently address her question about heaven.",
            uncertain_fields: [],
          };
          setUncertainFields(extraction.uncertain_fields);
          setForm({
            ...EMPTY_CONVERSATION_FORM,
            ...mapExtraction(extraction),
            person_id: personId,
            person_name: extraction.person_name || person?.name || "",
            source: "voice",
            session_id: activeSession?.id || "",
            transcript:
              "I met Joan near the pharmacy this afternoon. She recently lost her mother and asked why God allows suffering. We discussed James 1:13 and Revelation 21:3 and 4. She also asked whether everyone goes to heaven. I said I would return next Saturday afternoon to discuss God's Kingdom.",
            keep_audio: false,
          });
          setStatus("complete");
          return;
        }

        setStatus("uploading");
        const fd = new FormData();
        fd.append("audio", blob, `conversation-${Date.now()}.webm`);
        if (personId) fd.append("personId", personId);

        setStatus("transcribing");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Transcription failed");
        }
        setStatus("extracting");
        const data = (await res.json()) as {
          transcript: string;
          extraction: ConversationExtraction;
          audioPath?: string;
        };

        setAudioPath(data.audioPath || "");
        setUncertainFields(data.extraction.uncertain_fields || []);
        setForm({
          ...EMPTY_CONVERSATION_FORM,
          ...mapExtraction(data.extraction),
          person_id: personId,
          person_name: data.extraction.person_name || person?.name || "",
          source: "voice",
          session_id: activeSession?.id || "",
          transcript: data.transcript,
          audio_path: data.audioPath || "",
          keep_audio: false,
        });
        setStatus("complete");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("failed");
      }
    };
  }, [
    activeSession?.id,
    demoMode,
    person,
    personId,
    setError,
    setStatus,
  ]);

  const onSubmit = async (data: ConversationFormData) => {
    const result = await saveConversation({
      ...data,
      audio_path: audioPath || data.audio_path,
    });
    const rvId = searchParams.get("returnVisitId");
    if (rvId) {
      router.replace(`/return-visits/${rvId}`);
    } else {
      router.replace(`/people/${result.person.id}`);
    }
  };

  if (form && status === "complete") {
    return (
      <div className="animate-fade-up">
        <PageHeader
          title="Review conversation"
          subtitle="Edit anything before saving"
        />
        <ConversationForm
          initial={form}
          people={people}
          uncertainFields={uncertainFields}
          onSubmit={onSubmit}
          onCancel={() => {
            setForm(null);
            setStatus("idle");
          }}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Record Conversation"
        subtitle="Capture what was said — review before saving"
      />

      <Card className="flex flex-col items-center py-10">
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
                  : "bg-teal-700 text-white"
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
        <p className="mt-2 text-sm capitalize text-stone-500">
          {statusLabel(status)}
        </p>
        {error && (
          <p className="mt-3 max-w-xs text-center text-sm text-rose-700">
            {error}
          </p>
        )}
      </Card>

      {status === "idle" && (
        <div className="space-y-2">
          <Button variant="record" size="lg" className="w-full" onClick={start}>
            <Mic className="h-5 w-5" />
            Start recording
          </Button>
          {demoMode && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                void processRef.current(new Blob(["demo"], { type: "audio/webm" }));
              }}
            >
              Use Joan sample extraction
            </Button>
          )}
        </div>
      )}

      {status === "recording" && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={pause}>
            <Pause className="h-4 w-4" />
            Pause
          </Button>
          <Button variant="ghost" onClick={cancel}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={finish}>
            <Square className="h-4 w-4" />
            Finish
          </Button>
        </div>
      )}

      {status === "paused" && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={resume}>
            <Play className="h-4 w-4" />
            Resume
          </Button>
          <Button variant="ghost" onClick={cancel}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={finish}>
            <Square className="h-4 w-4" />
            Finish
          </Button>
        </div>
      )}

      {status === "failed" && (
        <Button
          className="w-full"
          onClick={() => {
            setError(null);
            setStatus("idle");
          }}
        >
          Try again
        </Button>
      )}

      <p className="text-center text-xs text-stone-400">
        Recordings up to 10 minutes. Nothing is saved until you confirm.
      </p>
    </div>
  );
}

function mapExtraction(
  extraction: ConversationExtraction
): Partial<ConversationFormData> {
  return {
    person_name: extraction.person_name,
    conversation_date: extraction.conversation_date || todayISO(),
    approximate_time: extraction.approximate_time,
    general_location: extraction.general_location,
    how_met: extraction.how_met,
    main_topic: extraction.main_topic,
    scriptures: scripturesToString(extraction.scriptures || []),
    questions_asked: extraction.questions_asked,
    concerns_circumstances: extraction.concerns_circumstances,
    publications_shared: extraction.publications_shared,
    interest_level: extraction.interest_level || "",
    promised_follow_up_date: extraction.promised_follow_up_date,
    promised_follow_up_time: extraction.promised_follow_up_time,
    next_topic: extraction.next_topic,
    action_required: extraction.action_required,
    additional_notes: extraction.additional_notes,
    summary: extraction.summary,
    next_visit_preparation: extraction.next_visit_preparation,
  };
}

function isProcessing(status: RecorderStatus) {
  return ["uploading", "transcribing", "extracting"].includes(status);
}

function statusLabel(status: RecorderStatus) {
  switch (status) {
    case "idle":
      return "Ready to record";
    case "recording":
      return "Recording…";
    case "paused":
      return "Paused";
    case "uploading":
      return "Uploading audio…";
    case "transcribing":
      return "Transcribing…";
    case "extracting":
      return "Extracting details…";
    case "complete":
      return "Ready for review";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function RecordConversationPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <RecordConversationInner />
    </Suspense>
  );
}
