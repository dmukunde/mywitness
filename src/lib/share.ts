export type ShareResult = "shared" | "opened" | "cancelled";

/**
 * Sends a message through whatever the phone offers: its own Share menu when
 * there is one (WhatsApp, Messages and so on), otherwise WhatsApp's own
 * "choose a contact" page.
 */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      // Closing the Share menu is not an error.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  return "opened";
}

/** Copies text so it can be pasted anywhere. Returns false if the phone would not allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
