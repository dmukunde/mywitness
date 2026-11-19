"use client";

import { useState } from "react";
import { Button, Input, Select, TimeField, Textarea } from "@/components/ui";
import { replyLink, replyMessage, type HandoverStatus, type Reply } from "@/lib/handover";
import { copyText, shareText } from "@/lib/share";
import { todayISO } from "@/lib/utils";

/**
 * The quick update sent back to whoever handed the study over: which lesson
 * they are on, whether they are still studying, when the next study is, and
 * an optional note. It becomes a link and a ready-to-send message.
 */
export function HandoverReplyForm({
  studyId,
  personName,
  sendTo,
  initial,
}: {
  studyId: string;
  personName: string | null;
  /** Who the update is for, for the button. */
  sendTo: string;
  initial: {
    by?: string;
    lessonNumber: number;
    status: HandoverStatus;
    nextDate?: string | null;
    nextTime?: string | null;
  };
}) {
  const [by, setBy] = useState(initial.by ?? "");
  const [lesson, setLesson] = useState(String(initial.lessonNumber));
  const [status, setStatus] = useState<HandoverStatus>(initial.status);
  const [nextDate, setNextDate] = useState(initial.nextDate ?? "");
  const [nextTime, setNextTime] = useState(initial.nextTime ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ link: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const build = (): Reply | null => {
    const number = Number(lesson);
    if (!by.trim()) {
      setError("Please type your name, so they know who the update is from.");
      return null;
    }
    if (!Number.isInteger(number) || number < 1 || number > 999) {
      setError("Please enter the lesson number they are on, for example 14.");
      return null;
    }
    setError(null);
    return {
      v: 1,
      kind: "reply",
      studyId,
      person: personName,
      by: by.trim(),
      lessonNumber: number,
      lesson: null,
      status,
      nextDate: nextDate || null,
      nextTime: nextTime.trim() || null,
      note: note.trim() || null,
      at: todayISO(),
    };
  };

  const send = async () => {
    const reply = build();
    if (!reply) return;
    const link = replyLink(window.location.origin, reply);
    const message = replyMessage(reply, link);
    setSent({ link, message });
    await shareText(message);
  };

  const copy = async () => {
    if (!sent) return;
    setCopied(await copyText(sent.message));
  };

  return (
    <div className="space-y-4">
      <Input label="Your name" value={by} onChange={(e) => setBy(e.target.value)} maxLength={80} />
      <Input
        label="Which lesson are they on now?"
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
      <Input
        label="Next study (optional)"
        type="date"
        value={nextDate}
        onChange={(e) => setNextDate(e.target.value)}
      />
      <TimeField label="Next study time (optional)" value={nextTime} onChange={setNextTime} />
      <Textarea
        label="Anything to add? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={600}
        placeholder="For example: they asked about the resurrection."
      />
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button className="w-full" onClick={() => void send()}>
        Send update to {sendTo}
      </Button>
      {sent && (
        <div className="space-y-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
          <p>
            Your update is ready to send. If your messages did not open, copy it and send it
            yourself.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy the message"}
          </Button>
        </div>
      )}
    </div>
  );
}
