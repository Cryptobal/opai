"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, UserRoundCheck, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type KpisData = {
  byGuardia: { guardiaId: string; guardiaName: string; totalCost: number }[];
  byInstallation: {
    installationId: string;
    installationName: string;
    totalCost: number;
  }[];
  summary: {
    totalUniformesAsignados: number;
    totalActivosAsignados: number;
    totalGeneral: number;
  };
};

export function InventarioKpisCard() {
  const [data, setData] = useState<KpisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ops/inventario/kpis")
      .then((r) => r.json())
      .then((d) => {
        if (d?.summary) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="text-sm text-muted-foreground">Cargando KPIs...</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const hasCosts = data.summary.totalGeneral > 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(n);

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            Costeo y KPIs
          </h3>
          <Link href="/ops/inventario/entregas">
            <Button variant="ghost" size="sm">
              Ver entregas
            </Button>
          </Link>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 min-h-[4rem]">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Costo total asignado
          </p>
          <p className="text-xl font-bold">
            {hasCosts ? formatCurrency(data.summary.totalGeneral) : "Sin costos asignados"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Uniformes: {formatCurrency(data.summary.totalUniformesAsignados)}
            {data.summary.totalActivosAsignados > 0 &&
              ` · Activos: ${formatCurrency(data.summary.totalActivosAsignados)}`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 min-h-[2rem]">
          {data.byGuardia.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <UserRoundCheck className="h-3.5 w-3.5" />
                Top por guardia
              </p>
              <ul className="space-y-1 text-sm">
                {data.byGuardia.slice(0, 5).map((g) => (
                  <li key={g.guardiaId} className="flex justify-between">
                    <span className="truncate">{g.guardiaName}</span>
                    <span className="font-medium shrink-0 ml-2">
                      {formatCurrency(g.totalCost)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.byInstallation.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Top por instalación
              </p>
              <ul className="space-y-1 text-sm">
                {data.byInstallation.slice(0, 5).map((i) => (
                  <li key={i.installationId} className="flex justify-between">
                    <Link
                      href={`/crm/installations/${i.installationId}`}
                      className="truncate hover:underline"
                    >
                      {i.installationName}
                    </Link>
                    <span className="font-medium shrink-0 ml-2">
                      {formatCurrency(i.totalCost)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
