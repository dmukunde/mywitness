"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { createClient } from "@/lib/supabase/client";
import { compressImage, blobToDataUrl } from "@/lib/image";
import { Card } from "@/components/ui";

const MAX_PHOTOS = 5;

export function PersonPhotoGallery({
  personId,
  readOnly = false,
}: {
  personId: string;
  /** View-only strip for Return Visit / Bible Study pages — editing happens on the person. */
  readOnly?: boolean;
}) {
  const {
    personPhotos,
    demoMode,
    user,
    addPersonPhoto,
    updatePersonPhotoCaption,
    deletePersonPhoto,
    reorderPersonPhotos,
  } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const photos = personPhotos
    .filter((p) => p.person_id === personId)
    .sort((a, b) => a.sort_order - b.sort_order);

  useEffect(() => {
    if (demoMode) return;
    const remote = photos.filter((p) => !p.photo_path.startsWith("data:"));
    if (remote.length === 0) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        remote.map(async (p) => {
          const { data } = await supabase.storage
            .from("person-photos")
            .createSignedUrl(p.photo_path, 3600);
          return [p.id, data?.signedUrl || ""] as const;
        })
      );
      if (!cancelled) {
        setSignedUrls(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, photos.map((p) => p.id).join(",")]);

  const srcFor = (photoPath: string, photoId: string) =>
    photoPath.startsWith("data:") ? photoPath : signedUrls[photoId] || "";

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      if (demoMode) {
        const dataUrl = await blobToDataUrl(compressed);
        await addPersonPhoto(personId, dataUrl, null);
      } else {
        if (!user) throw new Error("Please sign in to add a photo.");
        const supabase = createClient();
        const ext = "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("person-photos")
          .upload(path, compressed, { contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        await addPersonPhoto(personId, path, null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add photo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...photos];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void reorderPersonPhotos(
      personId,
      next.map((p) => p.id)
    );
  };

  if (readOnly && photos.length === 0) return null;

  if (readOnly) {
    return (
      <Card className="space-y-2">
        <p className="text-sm font-medium text-stone-700">
          How to find this place
        </p>
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((photo) => (
            <div key={photo.id} className="shrink-0 text-center">
              <div className="h-20 w-20 overflow-hidden rounded-xl bg-stone-100">
                {srcFor(photo.photo_path, photo.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={srcFor(photo.photo_path, photo.id)}
                    alt={photo.caption || "Location photo"}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              {photo.caption && (
                <p className="mt-1 max-w-20 truncate text-[11px] text-stone-500">
                  {photo.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-700">
          How to find this place
        </p>
        <span className="text-xs text-stone-400">
          {photos.length}/{MAX_PHOTOS}
        </span>
      </div>
      <p className="text-xs text-stone-500">
        A few photos — the turn, the gate, the house — help you retrace the
        way back. Please avoid photographing people without their permission,
        and don&apos;t store more than you need to find this place again.
      </p>

      {photos.length > 0 && (
        <div className="space-y-3">
          {photos.map((photo, index) => (
            <div key={photo.id} className="flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                {srcFor(photo.photo_path, photo.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={srcFor(photo.photo_path, photo.id)}
                    alt={photo.caption || "Location photo"}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  defaultValue={photo.caption || ""}
                  placeholder="Blue gate opposite the pharmacy"
                  onBlur={(e) =>
                    void updatePersonPhotoCaption(
                      photo.id,
                      e.target.value.trim() || null
                    )
                  }
                  className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-600"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded-lg p-1 text-stone-500 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={index === photos.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded-lg p-1 text-stone-500 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deletePersonPhoto(photo.id)}
                    className="ml-auto rounded-lg p-1 text-rose-600"
                    aria-label="Delete photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {photos.length < MAX_PHOTOS && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm font-medium text-stone-600 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {uploading ? "Adding…" : "Add a photo"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </Card>
  );
}
