"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { Button, Sheet } from "@/components/ui";

/**
 * The one-time "before your first voice note" notice. A voice note is the
 * publisher dictating their own observations, so this is shown once (not on
 * every use) and says plainly where the voice goes and how to use it
 * responsibly. It is remembered on this device for this account.
 */

const KEY_PREFIX = "mywitness-voice-note-notice-v1";
const listeners = new Set<() => void>();
// Used if the browser won't let us store anything (for example private browsing).
const acceptedThisSession = new Set<string>();

const keyFor = (userId?: string | null) => `${KEY_PREFIX}:${userId ?? "device"}`;

function readAccepted(key: string): boolean {
  if (acceptedThisSession.has(key)) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeAccepted(key: string) {
  acceptedThisSession.add(key);
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Remembered for this visit only.
  }
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

/** The notice itself. `onAccept` is omitted when it is only being re-read from Settings. */
export function VoiceNoteNoticeSheet({
  onAccept,
  onClose,
}: {
  onAccept?: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      title={onAccept ? "Before your first voice note" : "How voice notes work"}
      onClose={onClose}
    >
      <div className="space-y-3 text-sm text-stone-700">
        <p>
          <strong className="text-stone-900">Say it in your own words.</strong>{" "}
          After a visit, a study or a conversation, tell MyWitness what happened,
          like &ldquo;I visited Mary today and we discussed the resurrection.&rdquo;
          It turns your voice into text and picks out details like names, dates
          and scriptures. You review and correct everything before anything is
          saved.
        </p>
        <p>
          <strong className="text-stone-900">OpenAI processes it.</strong> To do
          this, your recording and its text are sent to OpenAI, a service that
          converts speech to text and finds the details. When you save the note,
          the recording is deleted unless you chose to keep it in Settings.
        </p>
        <p>
          <strong className="text-stone-900">Other people.</strong> Your notes may
          mention other people. Keep them respectful and accurate, and record
          only your own observations.{" "}
          <strong className="text-stone-900">
            Please don&apos;t record another person&apos;s voice without their
            permission.
          </strong>
        </p>
      </div>
      {onAccept ? (
        <>
          <Button className="w-full" onClick={onAccept}>
            I understand
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Not now
          </Button>
        </>
      ) : (
        <Button className="w-full" onClick={onClose}>
          Close
        </Button>
      )}
    </Sheet>
  );
}

/**
 * Use on a screen that starts a voice note. Returns whether the notice is
 * still needed, and the dialog to render. "Not now" leaves the screen.
 */
export function useVoiceNoteNotice(): { needsNotice: boolean; noticeDialog: ReactNode } {
  const { user } = useApp();
  const router = useRouter();
  const key = keyFor(user?.id);

  // On the server, report "accepted" so nothing is drawn until the browser
  // has checked what this device remembers.
  const accepted = useSyncExternalStore(
    subscribe,
    () => readAccepted(key),
    () => true
  );

  const leave = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/today");
  }, [router]);

  return {
    needsNotice: !accepted,
    noticeDialog: accepted ? null : (
      <VoiceNoteNoticeSheet onAccept={() => writeAccepted(key)} onClose={leave} />
    ),
  };
}
