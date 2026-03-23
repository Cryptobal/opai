"use client";

import Link from "next/link";
import { SubNav, type SubNavItem } from "@/components/opai/SubNav";
import { Button } from "@/components/ui/button";
import { LayoutGrid, BarChart2, History, Plus, AlertTriangle, Users } from "lucide-react";

const ITEMS: SubNavItem[] = [
  { href: "/ops/supervision", label: "Grilla", icon: LayoutGrid, exactMatch: true },
  { href: "/ops/supervision/hallazgos", label: "Hallazgos", icon: AlertTriangle },
  { href: "/ops/supervision/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/ops/supervision/historial", label: "Historial", icon: History },
  { href: "/ops/supervision/asignaciones", label: "Asignaciones", icon: Users },
];

export function SupervisionSubnav() {
  return (
    <div className="flex items-center justify-between gap-2">
      <SubNav items={ITEMS} className="mb-0" />
      <Button asChild size="sm" className="hidden lg:inline-flex shrink-0 gap-1.5">
        <Link href="/ops/supervision/nueva-visita">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nueva visita</span>
        </Link>
      </Button>
    </div>
  );
}
