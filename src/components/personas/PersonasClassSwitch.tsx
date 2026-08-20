"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type PersonasClass = "guardias" | "equipo";

const ITEMS: Array<{ id: PersonasClass; href: string; label: string }> = [
  { id: "guardias", href: "/personas/guardias", label: "Guardias" },
  { id: "equipo", href: "/personas/equipo", label: "Equipo interno" },
];

export function PersonasClassSwitch({ active }: { active: PersonasClass }) {
  return (
    <div
      role="tablist"
      aria-label="Clase de persona"
      className="inline-flex items-center rounded-full border border-ds-border-default bg-ds-surface-1 p-1"
    >
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "inline-flex min-h-10 sm:min-h-9 items-center rounded-full px-3 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-ds-text-2 hover:text-ds-text-1",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
