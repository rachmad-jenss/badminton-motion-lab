"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  ["/", "Labs"],
  ["/analyze", "Analyze"],
  ["/compare", "Compare"],
  ["/agent", "Local Agent"],
  ["/capture-guide", "Capture guide"],
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map(([href, label]) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
