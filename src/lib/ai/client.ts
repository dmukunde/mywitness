import { denial } from "@/lib/ai/limits";

/**
 * A readable message for a failed voice-note request. The server normally
 * explains itself; this covers the cases where it could not (for example the
 * hosting platform refusing a very large upload before the app sees it).
 */
export async function voiceNoteErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (body && typeof body.error === "string" && body.error) return body.error;
  if (res.status === 413) return denial("too_large").message;
  if (res.status === 401) return "Please sign in again to use voice notes.";
  if (res.status === 429) return denial("rate").message;
  return "The voice note couldn't be processed. Please try again.";
}
