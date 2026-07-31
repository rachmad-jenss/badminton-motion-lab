"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  ["/", "Home"],
  ["/analyze", "Analyze video"],
  ["/compare", "Progress"],
  ["/agent", "Setup"],
  ["/capture-guide", "Video guide"],
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map(([href, label]) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            className={`nav-link${active ? " active" : ""}`}
            href={href}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
