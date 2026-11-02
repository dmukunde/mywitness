"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { describeCrash, isMissingCodeError } from "@/lib/offline/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MyWitness unexpected error]", error);
  }, [error]);

  // A screen whose code isn't saved on the phone, opened with no signal, fails
  // to load. That isn't a fault in the screen: say what to do.
  const notSaved = isMissingCodeError(error);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="animate-fade-up">
        <p className="font-display text-4xl font-semibold tracking-tight text-emerald-900">
          MyWitness
        </p>
      </div>

      <div className="mt-10 space-y-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-stone-200/70">
        <h1 className="font-display text-xl font-semibold text-stone-900">
          {notSaved ? "This screen isn't saved on your phone yet" : "Something went wrong"}
        </h1>
        <p className="text-sm text-stone-600">
          {notSaved
            ? "It needs signal the first time. Your ministry data is safe. Go back to Today, and open this screen once when you have signal so it is saved for next time."
            : "This screen hit an unexpected error. Your ministry data is safe: try again, or head back to Today."}
        </p>
        <div className="flex gap-2">
          {!notSaved && (
            <Button variant="secondary" className="flex-1" onClick={() => reset()}>
              Try again
            </Button>
          )}
          {/* A full reload, which also works when the app's own navigation can't. */}
          {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
          <Button className="flex-1" onClick={() => window.location.assign("/today")}>
            Go to Today
          </Button>
        </div>
        <p className="break-words text-[11px] text-stone-400">
          Details for support: {describeCrash(error)}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
      </div>
    </div>
  );
}
