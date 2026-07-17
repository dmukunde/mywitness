"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/ui";

/** Legacy session URLs redirect to Today, where ministry time is edited. */
export default function LegacySessionPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/today");
  }, [router]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Ministry time"
        subtitle="Redirecting to Today…"
      />
    </div>
  );
}
