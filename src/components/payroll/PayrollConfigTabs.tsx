"use client";

import { ConfigTabs } from "@/components/configuracion/ConfigTabs";
import { HolidaysManager } from "@/components/payroll/HolidaysManager";
import { BonosCatalogManager } from "@/components/payroll/BonosCatalogManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Parámetros base</CardTitle>
            <CardDescription>UF, UTM y supuestos.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Próximo paso: editor de parámetros y versiones.
          </CardContent>
        </Card>
      ),
    },
    {
      id: "versionado",
      label: "Versionado",
      icon: Archive,
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Versionado</CardTitle>
            <CardDescription>Historial y vigencia.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Próximo paso: control de vigencia por periodo.
          </CardContent>
        </Card>
      ),
    },
  ];

  return <ConfigTabs tabs={tabs} defaultTab="feriados" />;
}
