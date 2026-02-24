/**
 * PAYROLL MODULE - DASHBOARD
 */

import Link from "next/link";
import { PageHeader } from "@/components/opai";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, FileText, Settings, CalendarDays, Wallet } from "lucide-react";

export default function PayrollDashboard() {
  const modules = [
    {
      href: "/payroll/periodos",
      title: "Períodos de Pago",
      description: "Liquidaciones mensuales, asistencias y generación de archivos.",
      icon: CalendarDays,
      color: "text-emerald-400 bg-emerald-400/10",
    },
    {
      href: "/payroll/anticipos",
      title: "Anticipos",
      description: "Generación y pago de anticipos mensuales a guardias.",
      icon: Wallet,
      color: "text-amber-400 bg-amber-400/10",
    },
    {
      href: "/payroll/simulator",
      title: "Simulador de Liquidación",
      description: "Simula liquidaciones con descuentos legales y costo empleador.",
      icon: Calculator,
      color: "text-emerald-400 bg-emerald-400/10",
    },
    {
      href: "/payroll/parameters",
      title: "Parámetros Legales",
      description: "Versiones de tasas, topes y tramos impositivos vigentes.",
      icon: FileText,
      color: "text-blue-400 bg-blue-400/10",
    },
  ];

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Payroll"
        description="Sistema de liquidaciones y costeo para Chile"
      />
      <PayrollSubnav />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-w-0">
        {modules.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="pt-5 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
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
              <strong className="text-foreground">Liquidaciones:</strong> Ejecuta liquidaciones masivas por período con asistencias OPAI o CSV externo
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">·</span>
            <span>
              <strong className="text-foreground">Archivos:</strong> Exporta Previred, F30-1, Libro de Remuneraciones y archivos banco
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">·</span>
            <span>
              <strong className="text-foreground">Snapshots inmutables:</strong> Cada liquidación guarda los parámetros exactos usados
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary">·</span>
            <span>
              <strong className="text-foreground">Sueldo por RUT:</strong> Override individual del guardia sobre el sueldo de la instalación
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
