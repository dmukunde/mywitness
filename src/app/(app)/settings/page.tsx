"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { MINISTRY_TYPE_LABELS, type MinistryType } from "@/lib/types";
import { minutesBetween, todayISO } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const {
    user,
    demoMode,
    settings,
    sessions,
    updateSettings,
    enableDemoMode,
    disableDemoMode,
    resetDemo,
    signOut,
    startSession,
    endSession,
    updateSession,
    activeSession,
    people,
    conversations,
    returnVisits,
    reminders,
  } = useApp();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualType, setManualType] = useState<MinistryType | "">("");
  const [message, setMessage] = useState<string | null>(null);

  const exportData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      user: { id: user?.id, email: user?.email },
      people,
      conversations,
      return_visits: returnVisits,
      ministry_sessions: sessions,
      reminders,
      settings,
      disclaimer:
        "This is an independent personal organization tool. It is not affiliated with or endorsed by Jehovah’s Witnesses or any of their legal entities.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mywitness-export-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setMessage("Browser notifications are not supported on this device.");
      return;
    }
    const permission = await Notification.requestPermission();
    await updateSettings({
      browser_notifications_enabled: permission === "granted",
    });
    setMessage(
      permission === "granted"
        ? "Browser notifications enabled."
        : "Notifications were not granted."
    );
  };

  const saveManualSession = async () => {
    if (!manualStart || !manualEnd) return;
    const start = new Date(manualStart).toISOString();
    const end = new Date(manualEnd).toISOString();
    const duration = minutesBetween(start, end);
    if (activeSession) await endSession();
    const session = await startSession({
      ministry_type: manualType || undefined,
    });
    await updateSession(session.id, {
      start_time: start,
      end_time: end,
      duration_minutes: duration,
      session_date: start.slice(0, 10),
      ministry_type: manualType || null,
    });
    setManualOpen(false);
    setMessage("Manual ministry time saved.");
  };

  const deleteAccount = async () => {
    if (demoMode) {
      disableDemoMode();
      router.replace("/login");
      return;
    }
    const res = await fetch("/api/delete-account", { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage(err.error || "Could not delete account.");
      setDeleteOpen(false);
      return;
    }
    await signOut();
    router.replace("/login");
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Settings" subtitle="Privacy and preferences" />

      <Card className="space-y-1">
        <p className="text-sm text-stone-500">Signed in as</p>
        <p className="font-medium text-stone-900">
          {demoMode ? "Demo publisher" : user?.email || "—"}
        </p>
      </Card>

      <section>
        <SectionTitle title="Reminders" />
        <Card className="space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Browser notifications</span>
            <input
              type="checkbox"
              checked={!!settings?.browser_notifications_enabled}
              onChange={async (e) => {
                if (e.target.checked) await requestNotifications();
                else
                  await updateSettings({ browser_notifications_enabled: false });
              }}
              className="h-4 w-4"
            />
          </label>
          <Input
            label="Remind me minutes before a visit"
            type="number"
            min={5}
            value={settings?.reminder_minutes_before ?? 60}
            onChange={(e) =>
              updateSettings({
                reminder_minutes_before: Number(e.target.value) || 60,
              })
            }
          />
          <Button variant="secondary" className="w-full" onClick={requestNotifications}>
            Request notification permission
          </Button>
        </Card>
      </section>

      <section>
        <SectionTitle title="Audio privacy" />
        <Card>
          <label className="flex items-start gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={!!settings?.keep_audio_after_transcription}
              onChange={(e) =>
                updateSettings({
                  keep_audio_after_transcription: e.target.checked,
                })
              }
            />
            <span>
              Default to keeping audio after transcription. You can still choose
              per conversation. Otherwise audio is deleted after successful
              transcription.
            </span>
          </label>
        </Card>
      </section>

      <section>
        <SectionTitle title="Ministry time" />
        <Card className="space-y-2">
          <p className="text-sm text-stone-600">
            Add or correct ministry time manually.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setManualOpen((v) => !v)}
          >
            Manual time entry
          </Button>
          {manualOpen && (
            <div className="space-y-3 pt-2">
              <Input
                label="Start"
                type="datetime-local"
                value={manualStart}
                onChange={(e) => setManualStart(e.target.value)}
              />
              <Input
                label="End"
                type="datetime-local"
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
              />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-stone-700">
                  Ministry type
                </span>
                <select
                  className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3"
                  value={manualType}
                  onChange={(e) =>
                    setManualType(e.target.value as MinistryType | "")
                  }
                >
                  <option value="">Optional</option>
                  {(Object.keys(MINISTRY_TYPE_LABELS) as MinistryType[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {MINISTRY_TYPE_LABELS[k]}
                      </option>
                    )
                  )}
                </select>
              </label>
              <Button className="w-full" onClick={saveManualSession}>
                Save manual session
              </Button>
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle title="Demo mode" />
        <Card className="space-y-2">
          {demoMode ? (
            <>
              <p className="text-sm text-amber-800">
                Demo mode is on. Data is fictional and stored only in this
                browser.
              </p>
              <Button variant="secondary" className="w-full" onClick={resetDemo}>
                Reset demo data
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  disableDemoMode();
                  router.replace("/login");
                }}
              >
                Exit demo mode
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                enableDemoMode();
                router.replace("/today");
              }}
            >
              Load fictional demo data
            </Button>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle title="Your data" />
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={exportData}>
            Export account data (JSON)
          </Button>
          {isSupabaseConfigured() && !demoMode && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                const res = await fetch("/api/export");
                if (!res.ok) {
                  setMessage("Export failed.");
                  return;
                }
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `mywitness-server-export-${todayISO()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export from server
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={handleSignOut}>
            Sign out
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account and all data
          </Button>
        </div>
      </section>

      {message && (
        <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {message}
        </p>
      )}

      <Card className="bg-stone-50 text-xs leading-relaxed text-stone-500 ring-stone-200">
        This is an independent personal organization tool. It is not affiliated
        with or endorsed by Jehovah’s Witnesses or any of their legal entities.
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete everything?"
        message="This permanently deletes your account and all associated people, conversations, return visits, sessions, and audio. This cannot be undone."
        confirmLabel="Delete all data"
        danger
        onConfirm={deleteAccount}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
