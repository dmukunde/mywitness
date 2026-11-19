"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { Button, Card, Input, Select, TimeField, Textarea } from "@/components/ui";
import { useHash } from "@/hooks/useHash";
import { useApp } from "@/lib/app-context";
import {
  STATUS_WORDS,
  decodeReply,
  replyToSessionForm,
  type HandoverStatus,
  type Reply,
} from "@/lib/handover";
import { clearHandedOver, stashPendingLink } from "@/lib/handover-store";
import { copyText } from "@/lib/share";
import type { BibleStudy } from "@/lib/types";

const day = (iso: string) => format(parseISO(iso), "EEE, MMM d");

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-lg space-y-4 px-4 py-6">{children}</div>;
}

/**
 * Opened from the update that comes back when someone has covered a study.
 * It shows what they said and lets the owner of the study add it, moving the
 * study to where they left off. Nothing changes until the owner confirms.
 */
export default function HandoverReplyPage() {
  const hash = useHash();
  const router = useRouter();
  const { user, loading, bibleStudies } = useApp();
  const [copied, setCopied] = useState(false);

  if (hash === null || loading) {
    return (
      <Shell>
        <p className="py-10 text-center text-sm text-stone-400">Loading…</p>
      </Shell>
    );
  }
  const decoded = decodeReply(hash);
  if (!decoded.ok) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold text-stone-900">Update on a Bible study</h1>
        <p className="rounded-xl bg-rose-50 px-3 py-3 text-sm text-rose-700">{decoded.reason}</p>
        <p className="px-1 text-xs text-stone-500">Details for support: {decoded.detail}</p>
      </Shell>
    );
  }
  const reply = decoded.value;

  if (!user) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold text-stone-900">
          Update from {reply.by}
        </h1>
        <p className="text-sm text-stone-600">
          To add this update to your Bible study{reply.person ? ` with ${reply.person}` : ""}:
          copy this link, open MyWitness from your home screen, go to the Bible Studies tab and
          tap &quot;Got a handover link?&quot; to paste it.
        </p>
        <Button
          className="w-full"
          onClick={async () => setCopied(await copyText(window.location.href))}
        >
          {copied ? "Link copied" : "Copy this link"}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            stashPendingLink(`/handover/reply#${hash}`);
            router.push("/login");
          }}
        >
          Or sign in here
        </Button>
      </Shell>
    );
  }

  const study = bibleStudies.find((s) => s.id === reply.studyId);
  if (!study) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold text-stone-900">
          Update from {reply.by}
        </h1>
        <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
          This update is for a study that is not in this account. If you have more than one
          account, sign in with the one you used to hand the study over.
        </p>
      </Shell>
    );
  }
  return <ReviewReply reply={reply} study={study} />;
}

function ReviewReply({ reply, study }: { reply: Reply; study: BibleStudy }) {
  const router = useRouter();
  const { studySessions, saveStudySession, updateBibleStudyStatus } = useApp();
  const [lesson, setLesson] = useState(String(reply.lessonNumber));
  const [status, setStatus] = useState<HandoverStatus>(reply.status);
  const [nextDate, setNextDate] = useState(reply.nextDate ?? "");
  const [nextTime, setNextTime] = useState(reply.nextTime ?? "");
  const [note, setNote] = useState(reply.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const already = studySessions.some(
    (s) =>
      s.bible_study_id === study.id &&
      s.session_date === reply.at &&
      (s.summary ?? "").startsWith(`Update from ${reply.by}`)
  );

  const apply = async () => {
    const number = Number(lesson);
    if (!Number.isInteger(number) || number < 1 || number > 999) {
      setError("Please enter a lesson number, for example 14.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const edited: Reply = {
        ...reply,
        lessonNumber: number,
        lesson: number === reply.lessonNumber ? reply.lesson : null,
        status,
        nextDate: nextDate || null,
        nextTime: nextTime.trim() || null,
        note: note.trim() || null,
      };
      const { study: saved } = await saveStudySession(replyToSessionForm(edited, study));
      if (saved.status !== status) await updateBibleStudyStatus(study.id, status);
      clearHandedOver(study.id);
      router.push(`/bible-studies/${study.id}`);
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : "Could not add this update. Please try again."
      );
      setBusy(false);
    }
  };

  const personName = reply.person || "this study";

  return (
    <Shell>
      <div>
        <p className="text-sm font-medium text-emerald-800">Update on a Bible study</p>
        <h1 className="font-display text-2xl font-bold text-stone-900">
          {reply.by} says {reply.person ? `${reply.person} is` : "they are"} on lesson{" "}
          {reply.lessonNumber}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {STATUS_WORDS[reply.status]}
          {reply.nextDate ? ` · next study ${day(reply.nextDate)}` : ""} · sent {day(reply.at)}
        </p>
      </div>

      {already ? (
        <Card className="space-y-3">
          <p className="text-sm text-stone-700">
            This update has already been added to your study with {personName}.
          </p>
          <Link
            href={`/bible-studies/${study.id}`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-700 px-4 font-medium text-white"
          >
            Open the study
          </Link>
        </Card>
      ) : (
        <Card className="space-y-4">
          <p className="text-sm text-stone-600">
            Check it, change anything that is not right, then add it. Nothing changes in your
            study until you tap Add.
          </p>
          <Input
            label="Lesson they are on now"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
          />
          <Select
            label="Are they still studying?"
            value={status}
            onChange={(e) => setStatus(e.target.value as HandoverStatus)}
          >
            <option value="active">Yes, still studying</option>
            <option value="paused">Paused for now</option>
            <option value="completed">Finished</option>
          </Select>
          <Input label="Next study" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          <TimeField label="Next study time" value={nextTime} onChange={setNextTime} />
          <Textarea
            label={`Note from ${reply.by}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={600}
          />
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <Button className="w-full" disabled={busy} onClick={() => void apply()}>
            {busy ? "Adding…" : "Add to my study"}
          </Button>
        </Card>
      )}
    </Shell>
  );
}
