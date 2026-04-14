"use client";

import { ConfigTabs } from "@/components/configuracion/ConfigTabs";
import { HolidaysManager } from "@/components/payroll/HolidaysManager";
import { BonosCatalogManager } from "@/components/payroll/BonosCatalogManager";
import { PayrollParametersEditor } from "@/components/payroll/PayrollParametersEditor";
import { Calendar, Coins, Settings2, Archive } from "lucide-react";

export function PayrollConfigTabs() {
  const tabs = [
    {
      id: "feriados",
      label: "Feriados",
      icon: Calendar,
      content: <HolidaysManager />,
    },
    {
      id: "bonos",
      label: "Bonos",
      icon: Coins,
      content: <BonosCatalogManager />,
    },
    {
      id: "parametros",
      label: "Parámetros Base",
      icon: Settings2,
      content: <PayrollParametersEditor mode="editor" />,
    },
    {
      id: "versionado",
      label: "Versionado",
      icon: Archive,
      content: <PayrollParametersEditor mode="versions" />,
    },
  ];

  return <ConfigTabs tabs={tabs} defaultTab="feriados" />;
}
