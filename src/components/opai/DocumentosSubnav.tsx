"use client";

import { SubNav, type SubNavItem } from "@/components/opai-ds/SubNav";
import { FolderOpen, ClipboardCheck, LayoutTemplate } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { canView } from "@/lib/permissions";

const DOCS_NAV_ITEMS: (SubNavItem & { subKey: "gestion" | "operativos" | "plantillas" })[] = [
  { href: "/opai/documentos", label: "Gestión Documental", icon: FolderOpen, subKey: "gestion" },
  { href: "/opai/documentos-operativos", label: "Docs Operativos", icon: ClipboardCheck, subKey: "operativos" },
  { href: "/opai/documentos/templates", label: "Templates", icon: LayoutTemplate, subKey: "plantillas" },
];

export function DocumentosSubnav() {
  const permissions = usePermissions();
  const visibleItems = DOCS_NAV_ITEMS.filter((item) =>
    canView(permissions, "docs", item.subKey),
  );
  return <SubNav items={visibleItems} />;
}
