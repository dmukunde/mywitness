"use client";

import { useEffect, useState } from "react";
import { formatDurationFromMs } from "@/lib/utils";

export function useElapsedTimer(startTime: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startTime) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startTime]);

  const elapsedMs = startTime
    ? Math.max(0, now - new Date(startTime).getTime())
    : 0;

  return {
    elapsedMs,
    label: formatDurationFromMs(elapsedMs),
  };
}
