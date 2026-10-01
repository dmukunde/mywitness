"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Share2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button, Card, PageHeader, SectionTitle } from "@/components/ui";
import {
  formatDisplayDate,
  formatDuration,
  monthKeyFor,
  monthRangeFor,
  previousMonthKey,
} from "@/lib/utils";
import {
  buildReportText,
  countBibleStudiesForRange,
  dailyBreakdownForRange,
  monthLabel,
  wasActiveInMinistry,
} from "@/lib/ministry-report";
import { sumMinutesForRange } from "@/lib/ministry-time";

export default function MonthlyReportPage() {
  const router = useRouter();
  const { sessions, conversations, studySessions } = useApp();
  const [monthKey, setMonthKey] = useState(previousMonthKey());
  const [sharedOverride, setSharedOverride] = useState<boolean | null>(null);
  const [includeDailyBreakdown, setIncludeDailyBreakdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const range = useMemo(() => monthRangeFor(monthKey), [monthKey]);

  const report = useMemo(() => {
    const derivedShared = wasActiveInMinistry(
      sessions,
      conversations,
      studySessions,
      range.start,
      range.end
    );
    return {
      monthKey,
      shared: sharedOverride ?? derivedShared,
      bibleStudies: countBibleStudiesForRange(studySessions, range.start, range.end),
      minutes: sumMinutesForRange(sessions, range.start, range.end),
      dailyBreakdown: dailyBreakdownForRange(sessions, range.start, range.end),
    };
  }, [sessions, conversations, studySessions, range, monthKey, sharedOverride]);

  const reportText = useMemo(
    () => buildReportText(report, { includeDailyBreakdown }),
    [report, includeDailyBreakdown]
  );

  const share = async () => {
    setShareError(null);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: reportText });
        return;
      } catch (err) {
        // User cancelling the share sheet is not an error worth surfacing.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    await copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError("Could not copy. Please select and copy the text below.");
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title="Monthly Report" subtitle="For end-of-month reporting" />

      <Card>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-stone-700">Month</span>
          <input
            type="month"
            value={monthKey}
            max={monthKeyFor()}
            onChange={(e) => {
              setMonthKey(e.target.value);
              setSharedOverride(null);
            }}
            className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </label>
      </Card>

      <section>
        <SectionTitle title="Official Report" />
        <Card className="space-y-4">
          <p className="font-display text-lg font-semibold text-emerald-950">
            {monthLabel(monthKey)}
          </p>

          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-700">
              Shared in the ministry
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={report.shared ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setSharedOverride(true)}
              >
                Yes
              </Button>
              <Button
                size="sm"
                variant={!report.shared ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setSharedOverride(false)}
              >
                No
              </Button>
            </div>
          </div>

          <Row label="Bible studies" value={String(report.bibleStudies)} />
          {report.minutes > 0 ? (
            <Row label="Hours" value={formatDuration(report.minutes)} />
          ) : (
            <p className="text-xs text-stone-400">
              No ministry time logged this month — Hours will be left off the
              shared report.
            </p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle title="Ministry Activity" />
        <p className="mb-2 text-xs text-stone-500">
          Your own record of where the time came from — not part of the
          official report unless you choose to include it below.
        </p>
        {report.dailyBreakdown.length === 0 ? (
          <Card>
            <p className="text-sm text-stone-500">
              No ministry time logged for {monthLabel(monthKey)}.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {report.dailyBreakdown.map(({ date, minutes }) => (
              <Card key={date} className="flex items-center justify-between gap-3 py-3">
                <p className="text-sm text-stone-700">{formatDisplayDate(date)}</p>
                <p className="font-display text-base font-semibold text-emerald-900">
                  {formatDuration(minutes)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <label className="flex items-center gap-2.5 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={includeDailyBreakdown}
            onChange={(e) => setIncludeDailyBreakdown(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600/30"
          />
          Include my daily activity breakdown when sharing
        </label>

        <Card className="bg-stone-50">
          <p className="whitespace-pre-wrap font-mono text-sm text-stone-700">
            {reportText}
          </p>
        </Card>

        {shareError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {shareError}
          </p>
        )}

        <Button className="w-full" onClick={() => void share()}>
          <Share2 className="h-5 w-5" />
          Share Report
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => void copy()}>
          {copied ? (
            <>
              <Check className="h-5 w-5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-5 w-5" />
              Copy Report
            </>
          )}
        </Button>
      </section>

      <Button variant="ghost" className="w-full" onClick={() => router.back()}>
        Back
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="font-display text-lg font-semibold text-emerald-900">
        {value}
      </span>
    </div>
  );
}
