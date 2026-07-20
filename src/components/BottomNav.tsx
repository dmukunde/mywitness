"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  Settings,
  Users,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavAccent = "green" | "purple" | "gold" | "neutral";

const tabs: Array<{
  href: string;
  label: string;
  icon: typeof Home;
  accent: NavAccent;
}> = [
  { href: "/today", label: "Today", icon: Home, accent: "green" },
  { href: "/people", label: "People", icon: Users, accent: "neutral" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, accent: "purple" },
  {
    href: "/bible-studies",
    label: "Bible Studies",
    icon: BookOpen,
    accent: "gold",
  },
  { href: "/settings", label: "Settings", icon: Settings, accent: "neutral" },
];

const ACTIVE: Record<NavAccent, string> = {
  green: "bg-emerald-50 text-emerald-800",
  purple: "bg-violet-50 text-violet-800",
  gold: "bg-amber-50 text-amber-800",
  neutral: "bg-stone-100 text-stone-700",
};

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/95 backdrop-blur-md safe-bottom">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 py-1.5">
        {tabs.map(({ href, label, icon: Icon, accent }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold leading-tight transition-colors sm:text-[11px]",
                  active ? ACTIVE[accent] : "text-stone-400 hover:text-stone-500"
                )}
              >
                <Icon
                  className={cn("h-5 w-5 shrink-0", active && "stroke-[2.35]")}
                  aria-hidden
                />
                <span className="max-w-full truncate text-center">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
