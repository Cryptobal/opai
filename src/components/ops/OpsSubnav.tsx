"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { OpsGlobalSearch } from "./OpsGlobalSearch";
import { usePermissions } from "@/lib/permissions-context";
import { canView, type RolePermissions } from "@/lib/permissions";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  UserRoundCheck,
  Clock3,
  ShieldAlert,
  Shield,
  Fingerprint,
  Route,
  Moon,
} from "lucide-react";

/** subKey: clave del submódulo en permissions (null = siempre visible si tiene acceso al módulo) */
const OPS_ITEMS = [
  { href: "/ops", label: "Inicio", icon: LayoutDashboard, subKey: null },
  { href: "/ops/puestos", label: "Puestos", icon: ClipboardList, subKey: "puestos" as const },
  { href: "/ops/pauta-mensual", label: "Pauta mensual", icon: CalendarDays, subKey: "pauta_mensual" as const },
  { href: "/ops/pauta-diaria", label: "Asistencia diaria", icon: UserRoundCheck, subKey: "pauta_diaria" as const },
  { href: "/ops/turnos-extra", label: "Turnos extra", icon: Clock3, subKey: "turnos_extra" as const },
  { href: "/ops/marcaciones", label: "Marcaciones", icon: Fingerprint, subKey: "marcaciones" as const },
  { href: "/ops/ppc", label: "PPC", icon: ShieldAlert, subKey: "ppc" as const },
  { href: "/ops/rondas", label: "Rondas", icon: Route, subKey: "rondas" as const },
  { href: "/ops/control-nocturno", label: "Control nocturno", icon: Moon, subKey: "control_nocturno" as const },
  { href: "/personas/guardias", label: "Guardias", icon: Shield, subKey: "guardias" as const },
];

function filterByPermissions(perms: RolePermissions) {
  return OPS_ITEMS.filter((item) => {
    if (!item.subKey) return true;
    return canView(perms, "ops", item.subKey);
  });
}

/**
 * OpsSubnav - Navegación del módulo Ops con buscador global.
 * Tabs y buscador siempre en filas separadas para evitar superposición.
 */
export function OpsSubnav({ className }: { className?: string } = {}) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const visibleItems = filterByPermissions(permissions);

  const isGuardiaDetailPage = pathname?.match(/^\/personas\/guardias\/[^/]+$/);
  const showSearch = !isGuardiaDetailPage;

  return (
    <nav className={cn("mb-6 space-y-2", className)}>
      {/* Tabs — desktop */}
      <div className="hidden sm:block">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {visibleItems.map((item) => {
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

      {/* Buscador — siempre debajo de los tabs, nunca en la misma fila */}
      {showSearch && (
        <OpsGlobalSearch className="w-full sm:max-w-xs" />
      )}
    </nav>
  );
}
