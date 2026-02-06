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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Simulador */}
        <Card className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10">
            <Calculator className="h-6 w-6 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold">Simulador de Liquidación</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Simula liquidaciones completas con todos los descuentos legales y
            costo empleador.
          </p>
          <div className="mt-6">
            <Link href="/payroll/simulator">
              <Button className="w-full">Abrir Simulador</Button>
            </Link>
          </div>
        </Card>

        {/* Parámetros */}
        <Card className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
            <FileText className="h-6 w-6 text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold">Parámetros Legales</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Gestiona versiones de tasas, topes y tramos impositivos vigentes.
          </p>
          <div className="mt-6">
            <Link href="/payroll/parameters">
              <Button variant="outline" className="w-full">Ver Parámetros</Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* Info */}
      <Card className="border-blue-500/20 bg-blue-500/5 p-6">
        <h3 className="mb-3 flex items-center gap-2 font-medium text-blue-400">
          <Settings className="h-5 w-5" />
          Información del Sistema
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-400">•</span>
            <span>
              <strong className="text-foreground">Snapshots inmutables:</strong> Cada simulación guarda los
              parámetros exactos usados
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-400">•</span>
            <span>
              <strong className="text-foreground">Versionado:</strong> Los parámetros legales se versionan
              por fecha de vigencia
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-400">•</span>
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
