"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Settings,
  Users,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/people", label: "People", icon: Users },
  { href: "/return-visits", label: "Return Visits", icon: CalendarDays },
  { href: "/activity", label: "Activity", icon: Clock3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/95 backdrop-blur-md safe-bottom">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-emerald-800" : "text-stone-400"
                )}
              >
                <Icon
                  className={cn("h-5 w-5", active && "stroke-[2.25]")}
                  aria-hidden
                />
                <span className="leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
