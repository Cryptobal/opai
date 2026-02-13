"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Bell, Calendar, ClipboardList, FileText, MapPin, Radio } from "lucide-react";

const RONDAS_TABS = [
  { href: "/ops/rondas", label: "Dashboard", icon: ClipboardList },
  { href: "/ops/rondas/monitoreo", label: "Monitoreo", icon: Radio },
  { href: "/ops/rondas/alertas", label: "Alertas", icon: Bell },
  { href: "/ops/rondas/checkpoints", label: "Checkpoints", icon: MapPin },
  { href: "/ops/rondas/templates", label: "Plantillas", icon: FileText },
  { href: "/ops/rondas/programacion", label: "Programación", icon: Calendar },
  { href: "/ops/rondas/reportes", label: "Reportes", icon: BarChart3 },
];

export function RondasSubnav({ className }: { className?: string } = {}) {
  const pathname = usePathname();

  return (
    <nav className={cn("mb-4 hidden sm:flex sm:items-center sm:gap-2", className)}>
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
        {RONDAS_TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
