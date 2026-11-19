"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Sheet, Textarea } from "@/components/ui";
import { locateHandoverLink } from "@/lib/handover";

/**
 * "Got a handover link?" A link opened from a message lands in the phone's
 * browser, which is not signed in to the app on the home screen. This lets
 * someone paste the message (or the link) here instead, and goes straight to it.
 */
export function HandoverPaste() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    const found = locateHandoverLink(text);
    if (!found) {
      setError(
        "I couldn't find a handover link in that. Copy the whole message you were sent, or just its link, and paste it again."
      );
      return;
    }
    setOpen(false);
    setText("");
    setError(null);
    router.push(found.path);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 text-sm font-medium text-amber-800 underline decoration-amber-300 underline-offset-2"
      >
        Got a handover link? Paste it here
      </button>
      <Sheet
        open={open}
        title="Open a handover"
        subtitle="Paste the message you were sent, or just its link."
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4">
          <Textarea
            label="Paste here"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder="Long-press here and choose Paste"
          />
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <Button className="w-full" disabled={!text.trim()} onClick={go}>
            Open
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}
