"use client";

import { useState } from "react";
import { ExternalLink, Loader2, MapPin, MapPinCheck, MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "w-full rounded-2xl bg-white/90 p-4 text-left shadow-sm ring-1 ring-stone-200/60 backdrop-blur",
        onClick && "cursor-pointer active:scale-[0.99] transition-transform",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "record";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
        size === "sm" && "px-3 py-2 text-sm min-h-10",
        size === "md" && "px-4 py-3 text-base min-h-12",
        size === "lg" && "px-5 py-4 text-lg min-h-14",
        variant === "primary" &&
          "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800",
        variant === "secondary" && "bg-stone-100 text-stone-800 hover:bg-stone-200",
        variant === "ghost" && "bg-transparent text-stone-700 hover:bg-stone-100",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "record" &&
          "bg-gradient-to-br from-emerald-600 to-green-700 text-white shadow-lg shadow-emerald-800/20",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-sm font-medium text-stone-700">{label}</span>
      )}
      <input
        className={cn(
          "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20",
          className
        )}
        {...props}
      />
      {hint && <span className="text-xs text-amber-700">{hint}</span>}
    </label>
  );
}

const TIME_PRESETS = ["Morning", "Afternoon", "Evening"] as const;

function isClockTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value.trim());
}

/**
 * Time field with a native time picker (tap opens the device's own picker on
 * iOS/Android) plus quick daypart presets, since many flows (AI extraction,
 * demo data) use "Morning"/"Afternoon"/"Evening" instead of a clock time.
 */
export function TimeField({
  label,
  value,
  onChange,
  className,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  hint?: string;
}) {
  const clockValue = isClockTime(value) ? value : "";
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <span className="block text-sm font-medium text-stone-700">
          {label}
        </span>
      )}
      <input
        type="time"
        value={clockValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      />
      <div className="flex flex-wrap gap-1.5">
        {TIME_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition",
              value === preset
                ? "bg-stone-800 text-white ring-stone-800"
                : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50"
            )}
          >
            {preset}
          </button>
        ))}
      </div>
      {hint && <span className="text-xs text-amber-700">{hint}</span>}
    </div>
  );
}

export type LocationCoords = { lat: number; lng: number };

function mapsUrlFor(coords: LocationCoords) {
  return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
}

/**
 * Free-text landmark/location field with a pin icon. When `onCoordsChange`
 * is supplied, also offers "Use current location" (native browser geolocation,
 * no third-party service) and, once captured, a "Reopen in Maps" link.
 * Coordinates are never shown to the user as raw numbers — only a
 * pinned/not-pinned state.
 */
export function LocationField({
  label = "Location",
  value,
  onChange,
  coords,
  onCoordsChange,
  placeholder,
  className,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  coords?: LocationCoords | null;
  onCoordsChange?: (coords: LocationCoords | null) => void;
  placeholder?: string;
  className?: string;
  hint?: string;
}) {
  const [capturing, setCapturing] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const captureLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location isn't available on this device.");
      return;
    }
    setGeoError(null);
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturing(false);
        onCoordsChange?.({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        setCapturing(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : "Couldn't get your location."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <span className="block text-sm font-medium text-stone-700">
          {label}
        </span>
      )}
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Landmark, village, or meeting place"}
          className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3.5 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </div>

      {onCoordsChange && (
        <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs">
          {coords ? (
            <>
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <MapPinCheck className="h-3.5 w-3.5" />
                Location pinned
              </span>
              <a
                href={mapsUrlFor(coords)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-800 underline decoration-emerald-200 underline-offset-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Reopen in Maps
              </a>
              <button
                type="button"
                onClick={() => onCoordsChange(null)}
                className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-700"
              >
                <MapPinOff className="h-3.5 w-3.5" />
                Remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={captureLocation}
              disabled={capturing}
              className="inline-flex items-center gap-1 font-medium text-emerald-800 disabled:opacity-60"
            >
              {capturing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MapPin className="h-3.5 w-3.5" />
              )}
              {capturing ? "Getting location…" : "Use current location"}
            </button>
          )}
        </div>
      )}
      {geoError && <span className="block text-xs text-rose-600">{geoError}</span>}
      {hint && <span className="text-xs text-amber-700">{hint}</span>}
    </div>
  );
}

export function Textarea({
  className,
  label,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-sm font-medium text-stone-700">{label}</span>
      )}
      <textarea
        className={cn(
          "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 min-h-24",
          className
        )}
        {...props}
      />
      {hint && <span className="text-xs text-amber-700">{hint}</span>}
    </label>
  );
}

export function Select({
  className,
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-sm font-medium text-stone-700">{label}</span>
      )}
      <select
        className={cn(
          "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-stone-400">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white/50 px-4 py-8 text-center">
      <p className="font-medium text-stone-700">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  accent,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Soft brand tint for section identity (Calendar purple, Bible Studies gold). */
  accent?: "green" | "purple" | "gold" | "neutral";
}) {
  const titleTone =
    accent === "purple"
      ? "text-violet-950"
      : accent === "gold"
        ? "text-amber-950"
        : accent === "green"
          ? "text-emerald-950"
          : "text-stone-900";
  const subtitleTone =
    accent === "purple"
      ? "text-violet-700/70"
      : accent === "gold"
        ? "text-amber-800/70"
        : accent === "green"
          ? "text-emerald-800/70"
          : "text-stone-500";

  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1
          className={cn(
            "font-display text-2xl font-semibold tracking-tight",
            titleTone
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className={cn("mt-1 text-sm", subtitleTone)}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <h3 className="font-display text-xl font-semibold text-stone-900">
          {title}
        </h3>
        <p className="mt-2 text-sm text-stone-600">{message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
