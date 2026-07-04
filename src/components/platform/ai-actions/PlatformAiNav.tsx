"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, ListChecks } from "lucide-react";

const AI_NAV = [
  { href: "/platform/settings/ai", label: "Proveedor", icon: Brain },
  { href: "/platform/ai/actions", label: "Acciones", icon: ListChecks },
];

export function PlatformAiNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {AI_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              active
                ? "bg-status-info-soft text-status-info-fg"
                : "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
