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
  Select,
} from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { BackupRestore } from "@/components/BackupRestore";
import { todayISO } from "@/lib/utils";
import { formatDbError } from "@/lib/db-errors";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SettingsPage() {
  const router = useRouter();
  const {
    user,
    demoMode,
    settings,
    sessions,
    updateSettings,
    updateDisplayName,
    updateEmail,
    updatePassword,
    saveDailyMinistryTime,
    displayName,
    enableDemoMode,
    disableDemoMode,
    resetDemo,
    signOut,
    people,
    conversations,
    returnVisits,
    bibleStudies,
    studySessions,
    ministryEvents,
    reminders,
  } = useApp();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHours, setManualHours] = useState(0);
  const [manualMinutes, setManualMinutes] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const nameValue = nameDraft ?? displayName;
  const emailValue = emailDraft ?? user?.email ?? "";

  const exportData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      user: { id: user?.id, email: user?.email },
      people,
      conversations,
      return_visits: returnVisits,
      bible_studies: bibleStudies,
      bible_study_sessions: studySessions,
      scheduled_ministry_events: ministryEvents,
      ministry_sessions: sessions,
      reminders,
      settings,
      disclaimer:
        "MyWitness is an independent personal organization tool designed to help individuals organize ministry notes, conversations, and return visits. It is not affiliated with, endorsed by, or produced by Jehovah’s Witnesses or any of their legal entities.",
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
    try {
      await saveDailyMinistryTime({
        hours: manualHours,
        minutes: manualMinutes,
      });
      setManualOpen(false);
      setManualHours(0);
      setManualMinutes(0);
      setMessage("Ministry time saved.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not save ministry time."
      );
    }
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
          {demoMode
            ? "Demo account"
            : displayName || user?.email || "—"}
        </p>
        {!demoMode && displayName && user?.email && (
          <p className="text-xs text-stone-500">{user.email}</p>
        )}
      </Card>

      <section>
        <SectionTitle title="Profile" />
        <Card className="space-y-4">
          <div className="space-y-3">
            <Input
              label="Display Name"
              placeholder="Doreen"
              value={nameValue}
              onChange={(e) => setNameDraft(e.target.value)}
              disabled={demoMode}
            />
            <p className="text-xs text-stone-500">
              Used in your greeting, for example “Good afternoon, Doreen.”
            </p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={
                demoMode ||
                savingName ||
                nameValue.trim() === displayName.trim() ||
                !nameValue.trim()
              }
              onClick={async () => {
                setSavingName(true);
                setMessage(null);
                try {
                  await updateDisplayName(nameValue);
                  setNameDraft(null);
                  setMessage("Display name saved.");
                } catch (err) {
                  setMessage(
                    err instanceof Error ? err.message : "Could not save name."
                  );
                } finally {
                  setSavingName(false);
                }
              }}
            >
              {savingName ? "Saving…" : "Save display name"}
            </Button>
          </div>

          <div className="border-t border-stone-100 pt-4 space-y-3">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={emailValue}
              onChange={(e) => setEmailDraft(e.target.value)}
              disabled={demoMode}
            />
            <p className="text-xs text-stone-500">
              Used only for signing in. You may need to confirm the new address
              by email.
            </p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={
                demoMode ||
                savingEmail ||
                emailValue.trim() === (user?.email || "").trim() ||
                !emailValue.trim()
              }
              onClick={async () => {
                setSavingEmail(true);
                setMessage(null);
                try {
                  await updateEmail(emailValue);
                  setEmailDraft(null);
                  setMessage(
                    "Check your inbox to confirm the new email address."
                  );
                } catch (err) {
                  setMessage(
                    err instanceof Error ? err.message : "Could not update email."
                  );
                } finally {
                  setSavingEmail(false);
                }
              }}
            >
              {savingEmail ? "Saving…" : "Change email"}
            </Button>
          </div>

          <div className="border-t border-stone-100 pt-4 space-y-3">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={demoMode}
              minLength={6}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={demoMode}
              minLength={6}
            />
            <Button
              variant="secondary"
              className="w-full"
              disabled={
                demoMode ||
                savingPassword ||
                !newPassword ||
                newPassword !== confirmPassword
              }
              onClick={async () => {
                if (newPassword !== confirmPassword) {
                  setMessage("Passwords do not match.");
                  return;
                }
                setSavingPassword(true);
                setMessage(null);
                try {
                  await updatePassword(newPassword);
                  setNewPassword("");
                  setConfirmPassword("");
                  setMessage("Password updated.");
                } catch (err) {
                  setMessage(
                    err instanceof Error
                      ? err.message
                      : "Could not update password."
                  );
                } finally {
                  setSavingPassword(false);
                }
              }}
            >
              {savingPassword ? "Saving…" : "Change password"}
            </Button>
          </div>
        </Card>
      </section>

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
            Log or correct today&apos;s ministry time. Prefer Add/Edit on the
            Today screen.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setManualOpen((v) => !v)}
          >
            Enter hours &amp; minutes
          </Button>
          <div className="border-t border-stone-100 pt-3">
            <Select
              label="Year total starts in"
              value={String(settings?.service_year_start_month ?? 9)}
              onChange={async (e) => {
                const value = Number(e.target.value);
                try {
                  await updateSettings({ service_year_start_month: value });
                  setMessage(null);
                } catch (err) {
                  setMessage(
                    formatDbError(
                      "save service year setting",
                      err,
                      "Could not save this setting."
                    )
                  );
                }
              }}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-xs text-stone-500">
              Controls the &ldquo;Year total&rdquo; shown on Today and
              Activity. Defaults to September, matching the usual
              service-year convention —
              choose January for an ordinary calendar year instead.
            </p>
          </div>
          {manualOpen && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Hours"
                  type="number"
                  min={0}
                  value={manualHours}
                  onChange={(e) =>
                    setManualHours(Math.max(0, Number(e.target.value) || 0))
                  }
                />
                <Input
                  label="Minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={manualMinutes}
                  onChange={(e) =>
                    setManualMinutes(
                      Math.min(59, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                />
              </div>
              <Button className="w-full" onClick={() => void saveManualSession()}>
                Save ministry time
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
        <SectionTitle title="Activity" />
        <Card className="space-y-3">
          <p className="text-sm text-stone-600">
            Review ministry time totals, frequent topics, and scriptures.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push("/activity")}
          >
            Open activity summary
          </Button>
        </Card>
      </section>

      <section>
        <SectionTitle title="Backup & Restore" />
        {isSupabaseConfigured() && !demoMode ? (
          <BackupRestore />
        ) : (
          <Card className="space-y-2">
            <p className="text-sm text-stone-600">
              {demoMode
                ? "Backup and restore aren't available in demo mode — sign in with a real account to back up your data."
                : "Sign in to back up your data."}
            </p>
            <Button variant="secondary" className="w-full" onClick={exportData}>
              Export demo data (JSON)
            </Button>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle title="Account" />
        <div className="space-y-2">
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
        <p className="rounded-xl bg-yellow-50 px-3 py-2 text-sm text-yellow-950 ring-1 ring-yellow-200/70">
          {message}
        </p>
      )}

      <section>
        <SectionTitle title="About" />
        <Card className="bg-stone-50 text-xs leading-relaxed text-stone-500 ring-stone-200">
          <p className="font-medium text-stone-600">MyWitness</p>
          <p className="mt-0.5 text-stone-500">Personal Ministry Companion</p>
          <p className="mt-3">
            MyWitness is an independent personal organization tool designed to
            help individuals organize ministry notes, conversations, and return
            visits. It is not affiliated with, endorsed by, or produced by
            Jehovah’s Witnesses or any of their legal entities.
          </p>
        </Card>
      </section>

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
