"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import { todayISO } from "@/lib/utils";
import {
  importBackup,
  summarizeBackup,
  validateBackupEnvelope,
  validateBackupFile,
  type BackupEnvelope,
  type BackupSummary,
  type ImportReport,
} from "@/lib/backup";

type Step = "idle" | "preview" | "confirmMerge" | "confirmReplace" | "report";

const TABLE_LABELS: Record<string, string> = {
  areas: "Areas",
  ministry_sessions: "Ministry sessions",
  people: "People",
  conversations: "Conversations",
  conversation_scriptures: "Scriptures",
  return_visits: "Return visits",
  reminders: "Reminders",
  bible_studies: "Bible studies",
  bible_study_sessions: "Bible study sessions",
  scheduled_ministry_events: "Calendar events",
  person_photos: "Photo captions (not the images)",
  toolkit_entries: "Teaching Toolkit entries",
};

async function downloadServerExport(): Promise<Record<string, unknown>> {
  const res = await fetch("/api/export");
  if (!res.ok) throw new Error("Could not reach the server to export data.");
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mywitness-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return data;
}

export function BackupRestore() {
  const { user, refresh } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [envelope, setEnvelope] = useState<BackupEnvelope | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaceConfirmText, setReplaceConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const reset = () => {
    setStep("idle");
    setEnvelope(null);
    setSummary(null);
    setError(null);
    setReplaceConfirmText("");
    setReport(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const fileCheck = validateBackupFile(file);
    if (!fileCheck.ok) {
      setError(fileCheck.error);
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setError("This file isn't valid JSON.");
      return;
    }
    const result = validateBackupEnvelope(json);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnvelope(result.envelope);
    setSummary(summarizeBackup(result.envelope));
    setStep("preview");
  };

  const runImport = async (mode: "merge" | "replace") => {
    if (!envelope || !user) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "replace") {
        await downloadServerExport();
      }
      const supabase = createClient();
      const result = await importBackup(supabase, user.id, envelope, mode);
      setReport(result);
      await refresh();
      setStep("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <p className="text-sm text-stone-600">
        Download a complete backup of your ministry data, or restore from a
        previous one. Backups never include your password, sign-in tokens, or
        photo image files — only your ministry records (photo captions are
        included, but you&apos;d need to re-add the images after a restore).
      </p>

      {step === "idle" && (
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => void downloadServerExport()}>
            <Download className="h-4 w-4" />
            Download backup
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Upload backup
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {step === "preview" && summary && (
        <div className="space-y-3 rounded-xl bg-stone-50 p-3">
          <p className="text-sm font-medium text-stone-800">Backup preview</p>
          <p className="text-xs text-stone-500">
            Exported {new Date(summary.exportedAt).toLocaleString()}
            {summary.dateRange.earliest &&
              ` · Covers ${summary.dateRange.earliest} to ${summary.dateRange.latest}`}
          </p>
          <ul className="space-y-1 text-sm text-stone-700">
            {Object.entries(summary.counts)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <li key={key} className="flex justify-between">
                  <span>{TABLE_LABELS[key] || key}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
          </ul>
          {summary.sampleNames.length > 0 && (
            <p className="text-xs text-stone-500">
              Includes: {summary.sampleNames.join(", ")}
              {summary.counts.people > summary.sampleNames.length ? "…" : ""}
            </p>
          )}
          <div className="space-y-2 pt-2">
            <Button className="w-full" onClick={() => setStep("confirmMerge")}>
              Merge with existing data
            </Button>
            <Button variant="danger" className="w-full" onClick={() => setStep("confirmReplace")}>
              Replace existing ministry data
            </Button>
            <Button variant="ghost" className="w-full" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === "confirmMerge" && (
        <div className="space-y-3 rounded-xl bg-stone-50 p-3">
          <p className="text-sm text-stone-700">
            This adds anything in the backup that isn&apos;t already in your
            account. Records that already exist (matched by their original
            ID) are skipped, not duplicated.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep("preview")} disabled={busy}>
              Back
            </Button>
            <Button className="flex-1" onClick={() => void runImport("merge")} disabled={busy}>
              {busy ? "Merging…" : "Merge"}
            </Button>
          </div>
        </div>
      )}

      {step === "confirmReplace" && (
        <div className="space-y-3 rounded-xl bg-rose-50 p-3">
          <p className="flex items-start gap-2 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This deletes all your current people, conversations, return
            visits, Bible studies, ministry sessions, reminders, and areas,
            then replaces them with the backup. A fresh safety backup will
            download automatically before anything is deleted.
          </p>
          <label className="block text-sm">
            <span className="text-stone-700">
              Type <strong>REPLACE</strong> to confirm
            </span>
            <input
              value={replaceConfirmText}
              onChange={(e) => setReplaceConfirmText(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-rose-200 bg-white px-3.5 py-3 text-base outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-600/20"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep("preview")} disabled={busy}>
              Back
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={busy || replaceConfirmText.trim() !== "REPLACE"}
              onClick={() => void runImport("replace")}
            >
              {busy ? "Replacing…" : "Replace everything"}
            </Button>
          </div>
        </div>
      )}

      {step === "report" && report && (
        <div className="space-y-3 rounded-xl bg-emerald-50 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {report.mode === "replace" ? "Replace" : "Merge"} complete
          </p>
          <ul className="space-y-1 text-sm text-stone-700">
            {Object.entries(report.perTable)
              .filter(([, t]) => t.inserted + t.skipped + t.rejected > 0)
              .map(([key, t]) => (
                <li key={key} className="flex justify-between">
                  <span>{TABLE_LABELS[key] || key}</span>
                  <span>
                    {t.inserted} added
                    {t.skipped > 0 ? `, ${t.skipped} skipped` : ""}
                    {t.rejected > 0 ? `, ${t.rejected} failed` : ""}
                  </span>
                </li>
              ))}
          </ul>
          {report.errors.length > 0 && (
            <details className="text-xs text-rose-700">
              <summary className="cursor-pointer">
                {report.errors.length} row{report.errors.length === 1 ? "" : "s"} could not be imported
              </summary>
              <ul className="mt-1 space-y-0.5">
                {report.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          <Button variant="secondary" className="w-full" onClick={reset}>
            Done
          </Button>
        </div>
      )}
    </Card>
  );
}
