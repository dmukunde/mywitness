"use client";

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
        variant === "primary" && "bg-teal-700 text-white shadow-sm hover:bg-teal-800",
        variant === "secondary" && "bg-stone-100 text-stone-800 hover:bg-stone-200",
        variant === "ghost" && "bg-transparent text-stone-700 hover:bg-stone-100",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "record" &&
          "bg-gradient-to-br from-teal-600 to-emerald-700 text-white shadow-lg shadow-teal-700/20",
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
          "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none ring-teal-600/0 transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20",
          className
        )}
        {...props}
      />
      {hint && <span className="text-xs text-amber-700">{hint}</span>}
    </label>
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
          "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 min-h-24",
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
          "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20",
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
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
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
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
