"use client";

import { SubNav } from "@/components/opai";
import { Calculator, FileText, CalendarDays, Wallet } from "lucide-react";

export function PayrollSubnav() {
  return (
    <SubNav
      items={[
        { href: "/payroll/periodos", label: "Períodos", icon: CalendarDays },
        { href: "/payroll/anticipos", label: "Anticipos", icon: Wallet },
        { href: "/payroll/simulator", label: "Simulador", icon: Calculator },
        { href: "/payroll/parameters", label: "Parámetros", icon: FileText },
      ]}
    />
  );
}
