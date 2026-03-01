"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { canView, hasCapability, type RolePermissions } from "@/lib/permissions";
import {
  LayoutDashboard,
  Receipt,
  CheckCircle2,
  Wallet,
  BarChart3,
} from "lucide-react";

const FINANCE_ITEMS = [
  { href: "/finanzas", label: "Inicio", icon: LayoutDashboard, subKey: null, capability: null },
  { href: "/finanzas/rendiciones", label: "Rendiciones", icon: Receipt, subKey: "rendiciones" as const, capability: null },
  { href: "/finanzas/aprobaciones", label: "Aprobaciones", icon: CheckCircle2, subKey: "aprobaciones" as const, capability: "rendicion_approve" as const },
  { href: "/finanzas/pagos", label: "Pagos", icon: Wallet, subKey: "pagos" as const, capability: "rendicion_pay" as const },
  { href: "/finanzas/reportes", label: "Reportes", icon: BarChart3, subKey: "reportes" as const, capability: null },
];

function filterByPermissions(perms: RolePermissions) {
  return FINANCE_ITEMS.filter((item) => {
    if (!item.subKey) return true;
    if (!canView(perms, "finance", item.subKey)) return false;
    if (item.capability && !hasCapability(perms, item.capability)) return false;
    return true;
  });
}

export function FinanceSubnav({ className }: { className?: string } = {}) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const visibleItems = filterByPermissions(permissions);

  return (
    <nav className={cn("mb-6", className)}>
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/finanzas"
              ? pathname === "/finanzas"
              : pathname === item.href || pathname?.startsWith(item.href + "/");
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
    </nav>
  );
}
