"use client";

import { SubNav } from "@/components/opai-ds";
import { Calculator, FileText, CalendarDays, Wallet, ClipboardCheck } from "lucide-react";

export function PayrollSubnav() {
  return (
    <SubNav
      items={[
        { href: "/payroll/periodos", label: "Períodos", icon: CalendarDays },
        { href: "/payroll/asistencia", label: "Cierre Asistencia", icon: ClipboardCheck },
        { href: "/payroll/anticipos", label: "Anticipos", icon: Wallet },
        { href: "/payroll/simulator", label: "Simulador", icon: Calculator },
        { href: "/payroll/parameters", label: "Parámetros", icon: FileText },
      ]}
    />
  );
}
