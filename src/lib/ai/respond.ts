import { NextResponse } from "next/server";
import type { AiDenial } from "@/lib/ai/limits";

/** A refusal as an HTTP answer: friendly message, a machine-readable code, and Retry-After when known. */
export function denialResponse(d: AiDenial) {
  return NextResponse.json(
    { error: d.message, code: d.reason },
    {
      status: d.status,
      headers: d.retryAfter ? { "Retry-After": String(d.retryAfter) } : undefined,
    }
  );
}
