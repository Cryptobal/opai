/**
 * PAYROLL MODULE - DASHBOARD
 */

import Link from "next/link";
import { PageHeader } from "@/components/opai";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, Settings } from "lucide-react";

export default function PayrollDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Sistema de liquidaciones y costeo para Chile"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Simulador */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
              <Calculator className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Simulador de Liquidación</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Simula liquidaciones completas con todos los descuentos legales y
                costo empleador.
              </p>
              <div className="mt-3">
                <Link href="/payroll/simulator">
                  <Button size="sm">Abrir Simulador</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>

        {/* Parámetros */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-400/10 text-blue-400">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Parámetros Legales</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Gestiona versiones de tasas, topes y tramos impositivos vigentes.
              </p>
              <div className="mt-3">
                <Link href="/payroll/parameters">
                  <Button size="sm" variant="outline">Ver Parámetros</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Info */}
      <Card className="border-primary/20 bg-primary/5 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
          <Settings className="h-4 w-4" />
          Información del Sistema
        </h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">·</span>
            <span>
              <strong className="text-foreground">Snapshots inmutables:</strong> Cada simulación guarda los
              parámetros exactos usados
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">·</span>
            <span>
              <strong className="text-foreground">Versionado:</strong> Los parámetros legales se versionan
              por fecha de vigencia
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">·</span>
            <span>
              <strong className="text-foreground">Referencias UF/UTM:</strong> Se obtienen automáticamente
              del schema fx
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
