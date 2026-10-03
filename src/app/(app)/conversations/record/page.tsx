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
import {
  ScriptureBadgeList,
  TopicBadge,
} from "@/components/badges";
import { InterestBadge } from "@/components/InterestBadge";
import { useApp } from "@/lib/app-context";
import { useVoiceRecorder, type RecorderStatus } from "@/hooks/useVoiceRecorder";
import {
  EMPTY_CONVERSATION_FORM,
  type ConversationExtraction,
  type ConversationFormData,
} from "@/lib/types";
import {
  formatDisplayDate,
  getNextSaturdayAfternoon,
  parseScriptures,
  scripturesToString,
  todayISO,
} from "@/lib/utils";

type ReviewStep = "summary" | "details";

function RecordConversationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { people, saveConversation, demoMode, settings } =
    useApp();
  const personId = searchParams.get("personId") || "";
  const person = people.find((p) => p.id === personId);

  const [form, setForm] = useState<ConversationFormData | null>(null);
  const [uncertainFields, setUncertainFields] = useState<string[]>([]);
  const [audioPath, setAudioPath] = useState("");
  const [reviewStep, setReviewStep] = useState<ReviewStep>("summary");
  const [saving, setSaving] = useState(false);
  const submissionId = useRef<string | null>(null);
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
            main_discussion_topic: "Why God allows suffering",
            scriptures_discussed: ["James 1:13", "Revelation 21:3, 4"],
            questions_raised: ["Does everyone go to heaven?"],
            proposed_return_visit_date: saturday.date,
            proposed_return_visit_time: "Afternoon",
            proposed_return_visit_date_phrase: "next Saturday afternoon",
            next_planned_topic: "God's Kingdom",
            general_location: person?.general_location || "Near the pharmacy",
            materials_shared: [],
            interest_level: "high",
            additional_notes: "Recently lost her mother",
            summary:
              "Met Joan near the pharmacy. Discussed Why God allows suffering. Scriptures: James 1:13; Revelation 21:3, 4. Questions raised: Does everyone go to heaven? Promised to return to discuss God's Kingdom.",
          };
          setUncertainFields([]);
          setForm({
            ...EMPTY_CONVERSATION_FORM,
            ...mapExtraction(extraction),
            person_id: personId,
            person_name: extraction.person_name || person?.name || "",
            location_lat: person?.location_lat ?? null,
            location_lng: person?.location_lng ?? null,
            source: "voice",
            session_id: "",
            transcript:
              "I met Joan near the pharmacy this afternoon. She recently lost her mother and asked why God allows suffering. We discussed James 1:13 and Revelation 21:3 and 4. She also asked whether everyone goes to heaven. I said I would return next Saturday afternoon to discuss God's Kingdom.",
            keep_audio: settings?.keep_audio_after_transcription ?? false,
          });
          setReviewStep("summary");
          setStatus("complete");
          return;
        }

        setStatus("uploading");
        const fd = new FormData();
        fd.append("audio", blob, `conversation-${Date.now()}.webm`);
        if (personId) fd.append("personId", personId);
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
          extraction: ConversationExtraction;
          audioPath?: string;
        };

        setAudioPath(data.audioPath || "");
        setUncertainFields([]);
        setForm({
          ...EMPTY_CONVERSATION_FORM,
          ...mapExtraction(data.extraction),
          person_id: personId,
          person_name: data.extraction.person_name || person?.name || "",
          location_lat: person?.location_lat ?? null,
          location_lng: person?.location_lng ?? null,
          source: "voice",
          session_id: "",
          transcript: data.transcript,
          audio_path: data.audioPath || "",
          keep_audio: settings?.keep_audio_after_transcription ?? false,
        });
        setReviewStep("summary");
        setStatus("complete");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("failed");
      }
    };
  }, [
    demoMode,
    person,
    personId,
    setError,
    setStatus,
    settings?.keep_audio_after_transcription,
  ]);

  const resetRecording = () => {
    submissionId.current = null;
    setForm(null);
    setAudioPath("");
    setUncertainFields([]);
    setReviewStep("summary");
    setStatus("idle");
    setError(null);
  };

  const onSubmit = async (data: ConversationFormData) => {
    setSaving(true);
    try {
      submissionId.current ??= crypto.randomUUID();
      await saveConversation({
        ...data,
        audio_path: audioPath || data.audio_path,
        client_id: submissionId.current,
      });
      const rvId = searchParams.get("returnVisitId");
      if (rvId) {
        router.replace(`/return-visits/${rvId}`);
      } else {
        router.replace(`/today?saved=1`);
      }
    } catch (err) {
      setSaving(false);
      throw err;
    }
  };

  const saveFromSummary = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        schedule_return_visit: Boolean(form.promised_follow_up_date.trim()),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  if (form && status === "complete" && reviewStep === "details") {
    return (
      <div className="animate-fade-up">
        <PageHeader
          title="Review details"
          subtitle="Edit anything before saving"
        />
        <ConversationForm
          initial={form}
          people={people}
          uncertainFields={uncertainFields}
          onSubmit={onSubmit}
          onCancel={() => setReviewStep("summary")}
        />
      </div>
    );
  }

  if (form && status === "complete" && reviewStep === "summary") {
    const returnVisitLabel = form.promised_follow_up_date
      ? `${formatDisplayDate(form.promised_follow_up_date)}${
          form.promised_follow_up_time ? ` · ${form.promised_follow_up_time}` : ""
        }`
      : "";

    return (
      <div className="animate-fade-up space-y-5">
        <PageHeader
          title="Conversation summary"
          subtitle="Confirm the highlights, then review or save"
        />

        {form.summary && (
          <Card className="bg-stone-50 ring-stone-200/80">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Summary
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-800">
              {form.summary}
            </p>
          </Card>
        )}

        <Card className="space-y-3">
          <SummaryRow
            label="Person’s name"
            value={form.person_name}
            uncertain={uncertainFields.includes("person_name")}
          />
          <SummaryRow
            label="Location"
            value={form.general_location}
            uncertain={uncertainFields.includes("general_location")}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Main discussion topic
              {uncertainFields.includes("main_discussion_topic") && (
                <span className="ml-2 font-medium normal-case text-amber-700">
                  Please confirm
                </span>
              )}
            </p>
            {form.main_topic ? (
              <div className="mt-2">
                <TopicBadge topic={form.main_topic} />
              </div>
            ) : (
              <p className="mt-1 text-sm text-stone-400">—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Scriptures discussed
              {uncertainFields.includes("scriptures_discussed") && (
                <span className="ml-2 font-medium normal-case text-amber-700">
                  Please confirm
                </span>
              )}
            </p>
            {form.scriptures.trim() ? (
              <ScriptureBadgeList
                className="mt-2"
                references={parseScriptures(form.scriptures)}
              />
            ) : (
              <p className="mt-1 text-sm text-stone-400">—</p>
            )}
          </div>
          <SummaryRow
            label="Questions raised"
            value={form.questions_asked}
            uncertain={uncertainFields.includes("questions_raised")}
          />
          <SummaryRow
            label="Materials shared"
            value={form.publications_shared}
            uncertain={uncertainFields.includes("materials_shared")}
          />
          <SummaryRow
            label="Proposed return visit"
            value={returnVisitLabel}
            uncertain={
              uncertainFields.includes("proposed_return_visit_date") ||
              uncertainFields.includes("proposed_return_visit_time")
            }
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Next planned topic
              {uncertainFields.includes("next_planned_topic") && (
                <span className="ml-2 font-medium normal-case text-amber-700">
                  Please confirm
                </span>
              )}
            </p>
            {form.next_topic ? (
              <div className="mt-2">
                <TopicBadge topic={form.next_topic} tone="amber" />
              </div>
            ) : (
              <p className="mt-1 text-sm text-stone-400">—</p>
            )}
          </div>
          {form.interest_level ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Interest level
              </p>
              <div className="mt-2">
                <InterestBadge level={form.interest_level} />
              </div>
            </div>
          ) : null}
        </Card>

        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={saving}
            onClick={() => setReviewStep("details")}
          >
            Review details
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={saving}
            onClick={() => void saveFromSummary()}
          >
            {saving ? "Saving…" : "Save conversation"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={saving}
            onClick={resetRecording}
          >
            Re-record
          </Button>
        </div>
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
                  : "bg-emerald-700 text-white"
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
                void processRef.current(
                  new Blob(["demo"], { type: "audio/webm" })
                );
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

function SummaryRow({
  label,
  value,
  uncertain,
}: {
  label: string;
  value?: string | null;
  uncertain?: boolean;
}) {
  const empty = !value?.trim();
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-sm text-stone-800">
        {empty ? (
          <span className="text-stone-400">
            {uncertain ? "Please confirm." : "—"}
          </span>
        ) : (
          value
        )}
      </p>
      {!empty && uncertain && (
        <p className="mt-0.5 text-xs text-amber-700">Please confirm.</p>
      )}
    </div>
  );
}

/** Map canonical extraction keys → form / DB field names. */
function mapExtraction(
  extraction: ConversationExtraction
): Partial<ConversationFormData> {
  const interest = extraction.interest_level;
  const interestLevel =
    interest === "unknown" ||
    interest === "very_low" ||
    interest === "low" ||
    interest === "moderate" ||
    interest === "high" ||
    interest === "very_high" ||
    interest === "bible_study"
      ? interest
      : "";

  return {
    person_name: extraction.person_name,
    conversation_date: todayISO(),
    general_location: extraction.general_location,
    main_topic: extraction.main_discussion_topic,
    scriptures: scripturesToString(extraction.scriptures_discussed || []),
    questions_asked: (extraction.questions_raised || []).join("; "),
    publications_shared: (extraction.materials_shared || []).join("; "),
    interest_level: interestLevel,
    promised_follow_up_date: extraction.proposed_return_visit_date || "",
    promised_follow_up_time: extraction.proposed_return_visit_time || "",
    next_topic: extraction.next_planned_topic,
    additional_notes: extraction.additional_notes,
    summary: extraction.summary,
    schedule_return_visit: Boolean(extraction.proposed_return_visit_date),
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
