"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ByStateRow = { key: string; label: string; count: number };
type BySupervisorRow = { supervisorId: string; name: string; count: number };

type Props = {
  byState: ByStateRow[];
  bySupervisor: BySupervisorRow[];
  periodLabel: string;
  periodOptions: { value: string; label: string }[];
  totals: { total: number; completed: number };
};

export function SupervisionReportesClient({
  byState,
  bySupervisor,
  periodLabel,
  periodOptions,
  totals,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setPeriod(value: string) {
    const params = new URLSearchParams();
    params.set("period", value);
    router.push(`/ops/supervision/reportes?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Período: <span className="font-medium text-foreground">{periodLabel}</span>
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Cambiar período
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {periodOptions.map((opt) => (
              <DropdownMenuItem key={opt.value} onClick={() => setPeriod(opt.value)}>
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen del período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Visitas totales</span>
              <span className="font-medium">{totals.total}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <span>Completadas</span>
              <span className="font-medium">{totals.completed}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado de instalaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {byState.length === 0 ? (
              <p className="text-muted-foreground">Sin datos de estado en este período.</p>
            ) : (
              byState.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <span>{row.label}</span>
                  <span className="font-medium">{row.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visitas por supervisor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {bySupervisor.length === 0 ? (
              <p className="text-muted-foreground">Sin datos de supervisores en este período.</p>
            ) : (
              bySupervisor.map((row) => (
                <div
                  key={row.supervisorId}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <span>{row.name}</span>
                  <span className="font-medium">{row.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
