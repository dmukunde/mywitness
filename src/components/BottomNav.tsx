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

const tabs = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/people", label: "People", icon: Users },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/bible-studies", label: "Bible Studies", icon: BookOpen },
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
          const studyActive = href === "/bible-studies" && active;
          const calActive = href === "/calendar" && active;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  studyActive
                    ? "text-amber-800"
                    : calActive
                      ? "text-violet-800"
                      : active
                        ? "text-emerald-800"
                        : "text-stone-400"
                )}
              >
                <Icon
                  className={cn("h-5 w-5", active && "stroke-[2.25]")}
                  aria-hidden
                />
                <span className="leading-none text-center">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
