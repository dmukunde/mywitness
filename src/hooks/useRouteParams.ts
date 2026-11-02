"use client";

import { usePathname } from "next/navigation";

/**
 * The id in addresses like /people/<id> or /bible-studies/<id>/record.
 *
 * It is read from the address in the browser's address bar rather than from
 * Next.js's route parameters. When the app opens with no signal, the phone
 * serves a saved copy of the page (see public/sw.js) that was prepared with a
 * placeholder id; reading the real address is what makes that saved copy show
 * the right person or study.
 */
export function useRouteParams(): { id: string } {
  const pathname = usePathname() ?? "";
  // "/people/abc/record" -> ["", "people", "abc", "record"]
  const raw = pathname.split("/")[2] ?? "";
  try {
    return { id: decodeURIComponent(raw) };
  } catch {
    return { id: raw };
  }
}
