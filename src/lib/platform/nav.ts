import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Tags,
  Receipt,
  ScrollText,
  Shield,
  ShieldAlert,
  Clock,
  BookOpen,
  MessageSquare,
  Sparkles,
  Settings,
} from "lucide-react";
import type { PlatformRole } from "@/lib/platform/roles";

export type PlatformNavGroup = "negocio" | "herramientas";

export interface PlatformNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: PlatformNavGroup;
  minRole?: PlatformRole;
  /** Prefijos extra que marcan el ítem activo. */
  matches?: string[];
  exactMatch?: boolean;
}

export const PLATFORM_NAV: readonly PlatformNavItem[] = [
  {
    href: "/platform",
    label: "Overview",
    icon: LayoutDashboard,
    group: "negocio",
    exactMatch: true,
    matches: ["/platform/dashboard"],
  },
  {
    href: "/platform/tenants",
    label: "Tenants",
    icon: Building2,
    group: "negocio",
  },
  {
    href: "/platform/catalog",
    label: "Catálogo",
    icon: Tags,
    group: "negocio",
    minRole: "owner",
    matches: ["/platform/pricing"],
  },
  {
    href: "/platform/billing",
    label: "Facturación",
    icon: Receipt,
    group: "negocio",
  },
  {
    href: "/platform/audit",
    label: "Auditoría",
    icon: ScrollText,
    group: "negocio",
  },
  {
    href: "/platform/fiscalizacion-dt",
    label: "Fiscalización DT",
    icon: Shield,
    group: "herramientas",
  },
  {
    href: "/platform/incidentes-tecnicos",
    label: "Incidentes DT",
    icon: ShieldAlert,
    group: "herramientas",
  },
  {
    href: "/platform/sincronizacion-horaria",
    label: "Hora oficial",
    icon: Clock,
    group: "herramientas",
  },
  {
    href: "/platform/knowledge",
    label: "Base de conocimiento",
    icon: BookOpen,
    group: "herramientas",
  },
  {
    href: "/platform/marketing",
    label: "Marketing",
    icon: MessageSquare,
    group: "herramientas",
  },
  {
    href: "/platform/ai",
    label: "IA",
    icon: Sparkles,
    group: "herramientas",
    matches: ["/platform/ai/usage", "/platform/ai/actions"],
  },
  {
    href: "/platform/settings",
    label: "Ajustes",
    icon: Settings,
    group: "herramientas",
    matches: ["/platform/settings/ai"],
  },
];

export function isPlatformNavActive(pathname: string, item: PlatformNavItem): boolean {
  if (item.href === "/platform/tenants" && pathname.startsWith("/platform/tenants/new")) {
    return false;
  }
  const candidates = [item.href, ...(item.matches ?? [])];
  return candidates.some((href) => {
    if (item.exactMatch && href === "/platform") {
      return pathname === "/platform" || pathname === "/platform/dashboard";
    }
    if (href === "/platform") {
      return pathname === "/platform" || pathname === "/platform/dashboard";
    }
    return pathname === href || pathname.startsWith(href + "/");
  });
}
