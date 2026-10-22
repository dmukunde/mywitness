"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { usePushStatus } from "@/hooks/usePushStatus";

const PRIVATE_KEY = "mywitness-push-private";

function readPrivate(): boolean {
  try {
    return localStorage.getItem(PRIVATE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Turning notifications on, in one tap, with an honest explanation whenever
 * they can't work (iPhone not installed, blocked, not set up on the server,
 * or a browser without push) and the calendar fallback in those cases.
 */
export function NotificationSetup({ compact = false }: { compact?: boolean }) {
  const push = usePushStatus();
  const [privateMode, setPrivate] = useState(readPrivate);
  const [tested, setTested] = useState(false);

  if (push.loading) return null;

  const fallback =
    "You can still add any reminder to your calendar (open it and choose Add to calendar), and reminders show here and on Home whenever you open the app.";

  let body: React.ReactNode;
  if (push.support === "needs-install") {
    body = (
      <>
        <p className="text-sm text-stone-700">
          On iPhone and iPad, notifications work once MyWitness is on your Home
          Screen: tap <span className="font-medium">Share</span>, then{" "}
          <span className="font-medium">Add to Home Screen</span>, and open it from there.
        </p>
        <p className="text-xs text-stone-500">{fallback}</p>
      </>
    );
  } else if (push.support === "unsupported") {
    body = (
      <>
        <p className="text-sm text-stone-700">
          This browser can&rsquo;t send notifications when the app is closed.
        </p>
        <p className="text-xs text-stone-500">{fallback}</p>
      </>
    );
  } else if (!push.serverConfigured) {
    body = (
      <>
        <p className="text-sm text-stone-700">
          Notifications aren&rsquo;t switched on for this app yet — they need a
          one-time setup on the server.
        </p>
        <p className="text-xs text-stone-500">{fallback}</p>
      </>
    );
  } else if (push.permission === "denied") {
    body = (
      <>
        <p className="text-sm text-stone-700">
          Notifications are blocked for MyWitness. Allow them in your phone or
          browser settings for this app, then come back and tap below.
        </p>
        <Button className="w-full" variant="secondary" disabled={push.busy} onClick={() => void push.refresh()}>
          I&rsquo;ve allowed them
        </Button>
      </>
    );
  } else if (push.subscribed && push.permission === "granted") {
    body = (
      <>
        <p className="text-sm text-emerald-900">
          Notifications are on for this device. You&rsquo;ll be alerted when a
          reminder is due, even if MyWitness is closed.
        </p>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-stone-700">
          <span>
            Keep details off the lock screen
            <span className="block text-xs text-stone-500">
              Shows &ldquo;You have a reminder&rdquo; instead of the words.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-emerald-700"
            checked={privateMode}
            disabled={push.busy}
            onChange={(e) => {
              setPrivate(e.target.checked);
              try {
                localStorage.setItem(PRIVATE_KEY, e.target.checked ? "1" : "0");
              } catch {
                // a convenience only
              }
              void push.setPrivateMode(e.target.checked);
            }}
          />
        </label>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={push.busy}
            onClick={async () => {
              setTested(false);
              await push.sendTest();
              setTested(true);
            }}
          >
            Send a test
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            disabled={push.busy}
            onClick={() => void push.disable()}
          >
            Turn off
          </Button>
        </div>
        {tested && !push.error && (
          <p className="text-xs text-emerald-800">
            Test sent — it should appear on this device in a moment.
          </p>
        )}
      </>
    );
  } else {
    body = (
      <>
        <p className="text-sm text-stone-700">
          Get an alert at the exact time you choose, even when MyWitness
          isn&rsquo;t open.
        </p>
        <Button
          className="w-full"
          disabled={push.busy}
          onClick={() => void push.enable(privateMode)}
        >
          <Bell className="h-4 w-4" />
          {push.busy ? "Turning on…" : "Turn on notifications"}
        </Button>
      </>
    );
  }

  const on = push.subscribed && push.permission === "granted";
  return (
    <Card className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center gap-2">
        {on ? (
          <Bell className="h-4 w-4 text-emerald-700" />
        ) : (
          <BellOff className="h-4 w-4 text-stone-400" />
        )}
        <p className="font-medium text-stone-900">Notifications</p>
      </div>
      {body}
      {push.error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{push.error}</p>
      )}
    </Card>
  );
}
