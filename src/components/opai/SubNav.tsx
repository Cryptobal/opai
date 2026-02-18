"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface SubNavItem {
  href: string;
  label: string;
  /** Icono opcional — si se pasa, se muestra antes del label */
  icon?: LucideIcon;
}

interface SubNavProps {
  items: SubNavItem[];
  className?: string;
}

/**
 * SubNav - Navegación secundaria horizontal reutilizable.
 *
 * Pills scrollables horizontalmente con iconos opcionales.
 * Mobile: oculto (el sidebar drawer maneja la navegación, igual que desktop).
 * Desktop (sm+): visible como pills con icono + label.
 */
export function SubNav({ items, className }: SubNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("mb-6 hidden sm:block", className)}>
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
