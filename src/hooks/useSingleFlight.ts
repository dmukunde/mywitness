"use client";

import { useCallback, useRef } from "react";

/**
 * Ignores a second call while the first is still running.
 *
 * A `saving` state flag only takes effect after the next render, so two taps
 * in quick succession both get through and each creates its own record.
 * A ref flips immediately, so the second tap is dropped.
 */
export function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    try {
      return await fn();
    } finally {
      busy.current = false;
    }
  }, []);
}
