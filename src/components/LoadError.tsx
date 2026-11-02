"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Card } from "@/components/ui";

/**
 * Shown instead of the screen when the records could not be loaded and there
 * is no saved copy on this phone. It exists so an empty list can never be
 * mistaken for lost records: this says plainly that the load failed.
 */
export function LoadError() {
  const { syncNow } = useApp();
  const [busy, setBusy] = useState(false);

  return (
    <div role="alert" className="mt-6">
      <Card className="space-y-3 text-center">
        <h2 className="font-display text-xl font-semibold text-stone-900">
          We couldn&apos;t load your records
        </h2>
        <p className="text-sm text-stone-600">
          Your information is safe. This usually means a weak signal or none at
          all. Please check your signal and try again.
        </p>
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await syncNow();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Trying…" : "Try again"}
        </Button>
      </Card>
    </div>
  );
}
