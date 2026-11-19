"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { Button, Card } from "@/components/ui";
import { ContactButtons } from "@/components/ContactButtons";
import { HandoverReplyForm } from "@/components/HandoverReplyForm";
import { useHash } from "@/hooks/useHash";
import { useApp } from "@/lib/app-context";
import {
  STATUS_WORDS,
  decodeHandover,
  handoverHasEnded,
  handoverToStudyForm,
  type Handover,
} from "@/lib/handover";
import { findCoveringByOwnerStudy, saveCovering, stashPendingLink } from "@/lib/handover-store";
import { copyText } from "@/lib/share";
import { todayISO } from "@/lib/utils";
import type { Person } from "@/lib/types";

const day = (iso: string) => format(parseISO(iso), "EEE, MMM d");

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="text-right font-medium text-stone-900">{children}</span>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-lg space-y-4 px-4 py-6">{children}</div>;
}

/**
 * Opened from a handover link. Everything shown comes from the link itself
 * (the part after "#" is never sent to a server), so this works for someone
 * with no account. Someone who has MyWitness and is signed in can add the
 * study to their own app.
 */
export default function HandoverPage() {
  const hash = useHash();
  if (hash === null) {
    return (
      <Shell>
        <p className="py-10 text-center text-sm text-stone-400">Loading…</p>
      </Shell>
    );
  }
  const decoded = decodeHandover(hash);
  if (!decoded.ok) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-bold text-stone-900">Bible study handover</h1>
        <p className="rounded-xl bg-rose-50 px-3 py-3 text-sm text-rose-700">{decoded.reason}</p>
        <p className="px-1 text-xs text-stone-500">Details for support: {decoded.detail}</p>
      </Shell>
    );
  }
  return <HandoverView handover={decoded.value} hash={hash} />;
}

function HandoverView({ handover: h, hash }: { handover: Handover; hash: string }) {
  const router = useRouter();
  const { user, loading, people, displayName, savePerson, saveBibleStudy } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameName, setSameName] = useState<Person | null>(null);
  const [copied, setCopied] = useState(false);

  const added = findCoveringByOwnerStudy(h.studyId);
  const ended = handoverHasEnded(h, todayISO());

  const addToMine = async (choice?: { useExisting?: Person; newPerson?: boolean }) => {
    setError(null);
    const existing =
      people.find((p) => p.name.trim().toLowerCase() === h.person.name.trim().toLowerCase()) ?? null;
    if (existing && !choice) {
      setSameName(existing);
      return;
    }
    setSameName(null);
    setBusy(true);
    try {
      const person =
        choice?.useExisting ??
        (await savePerson(
          {
            name: h.person.name,
            phone_number: h.person.phone,
            general_location: h.person.place,
          },
          { confirmedDistinct: Boolean(choice?.newPerson) }
        ));
      const study = await saveBibleStudy(handoverToStudyForm(h, person.id));
      saveCovering(study.id, {
        ownerStudyId: h.studyId,
        from: h.from,
        person: h.person.name,
        end: h.end,
      });
      router.push(`/bible-studies/${study.id}`);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Could not add this study. Please try again."
      );
      setBusy(false);
    }
  };

  const signIn = () => {
    stashPendingLink(`/handover#${hash}`);
    router.push("/login");
  };

  return (
    <Shell>
      <div>
        <p className="text-sm font-medium text-emerald-800">Bible study handover</p>
        <h1 className="font-display text-2xl font-bold text-stone-900">
          {h.to ? `${h.to}, ` : ""}from {h.from}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Covering {day(h.start)} to {day(h.end)}
        </p>
      </div>

      {ended && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This handover ended on {day(h.end)}. Check with {h.from} before visiting.
        </p>
      )}

      <Card className="space-y-3">
        <div>
          <p className="font-display text-xl font-semibold text-stone-900">{h.person.name}</p>
          {h.person.place && <p className="text-sm text-stone-600">{h.person.place}</p>}
        </div>
        {h.person.phone && <ContactButtons phoneNumber={h.person.phone} personName={h.person.name} />}
      </Card>

      <Card className="divide-y divide-stone-100">
        <Row label="Publication">{h.study.publication}</Row>
        <Row label="Now on">
          {h.study.lesson || `Lesson ${h.study.lessonNumber}`} ({h.study.lessonNumber} of{" "}
          {h.study.totalLessons})
        </Row>
        <Row label="Status">{STATUS_WORDS[h.study.status]}</Row>
        <Row label="How often">
          {h.study.frequency}
          {h.study.preferredDay ? `, ${h.study.preferredDay}` : ""}
          {h.study.preferredTime ? ` ${h.study.preferredTime}` : ""}
        </Row>
        {h.study.nextDate && (
          <Row label="Next study">
            {day(h.study.nextDate)}
            {h.study.nextTime ? ` · ${h.study.nextTime}` : ""}
          </Row>
        )}
        {h.study.lastDate && <Row label="Last study">{day(h.study.lastDate)}</Row>}
        {h.study.prep && (
          <div className="py-2 text-sm">
            <p className="text-stone-500">Notes from {h.from}</p>
            <p className="mt-1 whitespace-pre-wrap text-stone-900">{h.study.prep}</p>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-medium text-stone-900">Do you use MyWitness?</p>
        {loading ? (
          <p className="text-sm text-stone-400">Checking…</p>
        ) : user ? (
          added ? (
            <>
              <p className="text-sm text-stone-600">You have already added this study to your app.</p>
              <Link
                href={`/bible-studies/${added}`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-700 px-4 font-medium text-white"
              >
                Open it
              </Link>
            </>
          ) : sameName ? (
            <div className="space-y-2">
              <p className="text-sm text-stone-700">
                You already have {sameName.name} in your people. Is it the same person?
              </p>
              <Button className="w-full" disabled={busy} onClick={() => void addToMine({ useExisting: sameName })}>
                Yes, use my {sameName.name}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => void addToMine({ newPerson: true })}
              >
                No, add as a new person
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-600">
                Add {h.person.name} and this study to your own people, with your own reminders.
              </p>
              <Button className="w-full" disabled={busy} onClick={() => void addToMine()}>
                {busy ? "Adding…" : "Add to my people"}
              </Button>
            </>
          )
        ) : (
          <>
            <p className="text-sm text-stone-600">
              If you have MyWitness on your home screen: copy this link, open MyWitness, go to
              the Bible Studies tab and tap &quot;Got a handover link?&quot; to paste it. If you
              don&apos;t use MyWitness, everything you need is on this page.
            </p>
            <Button
              className="w-full"
              onClick={async () => setCopied(await copyText(window.location.href))}
            >
              {copied ? "Link copied" : "Copy this link"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={signIn}>
              Or sign in here
            </Button>
          </>
        )}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="font-medium text-stone-900">When {h.from} is back</p>
          <p className="text-sm text-stone-600">
            Tell {h.from} where {h.person.name} has got to. It opens your messages with an update
            ready to send.
          </p>
        </div>
        <HandoverReplyForm
          key={displayName}
          studyId={h.studyId}
          personName={h.person.name}
          sendTo={h.from}
          initial={{
            by: displayName,
            lessonNumber: h.study.lessonNumber,
            status: h.study.status,
            nextDate: h.study.nextDate,
            nextTime: h.study.nextTime,
          }}
        />
      </Card>

      <p className="px-1 text-center text-xs text-stone-500">
        Everything on this page comes from the link you were sent. It is not stored on our servers.
      </p>
    </Shell>
  );
}
