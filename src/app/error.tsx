"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[MyWitness unexpected error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="animate-fade-up">
        <p className="font-display text-4xl font-semibold tracking-tight text-emerald-900">
          MyWitness
        </p>
      </div>

      <div className="mt-10 space-y-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-stone-200/70">
        <h1 className="font-display text-xl font-semibold text-stone-900">
          Something went wrong
        </h1>
        <p className="text-sm text-stone-600">
          This screen hit an unexpected error. Your ministry data is safe —
          try again, or head back to Today.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => reset()}>
            Try again
          </Button>
          <Button className="flex-1" onClick={() => router.push("/today")}>
            Go to Today
          </Button>
        </div>
      </div>
    </div>
  );
}
