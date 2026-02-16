"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Shield, Users } from "lucide-react";

const PERSONAS_ITEMS = [
  { href: "/personas/guardias", label: "Guardias", icon: Shield },
];

/**
 * PersonasSubnav — Navegación del módulo Personas.
 * Separado de OpsSubnav para que en /personas/* no aparezcan tabs de Operaciones.
 */
export function PersonasSubnav({ className }: { className?: string } = {}) {
  const pathname = usePathname();
  const isDetailPage = pathname?.match(/^\/personas\/guardias\/[^/]+$/);
  if (isDetailPage) return null;

  return (
    <nav className={cn("mb-6", className)}>
      <div className="hidden sm:block">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {PERSONAS_ITEMS.map((item) => {
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
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
