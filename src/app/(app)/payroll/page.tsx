/**
 * PAYROLL MODULE - DASHBOARD
 */

import Link from "next/link";
import { PageHero, Surface } from "@/components/opai-ds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, FileText, Settings, CalendarDays, Wallet, ClipboardCheck, Banknote } from "lucide-react";

export default function PayrollDashboard() {
  const modules = [
    {
      href: "/payroll/periodos",
      title: "Períodos de Pago",
      description: "Liquidaciones mensuales, asistencias y generación de archivos.",
      icon: CalendarDays,
      color: "text-status-ok-fg bg-status-ok-soft",
    },
    {
      href: "/payroll/asistencia",
      title: "Cierre de Asistencia",
      description: "Verifica y cierra el período de asistencia previo a procesar nómina.",
      icon: ClipboardCheck,
      color: "text-status-info-fg bg-status-info-soft",
    },
    {
      href: "/payroll/anticipos",
      title: "Anticipos",
      description: "Generación y pago de anticipos mensuales a guardias.",
      icon: Wallet,
      color: "text-status-warn-fg bg-status-warn-soft",
    },
    {
      href: "/payroll/simulator",
      title: "Simulador de Liquidación",
      description: "Simula liquidaciones con descuentos legales y costo empleador.",
      icon: Calculator,
      color: "text-status-ok-fg bg-status-ok-soft",
    },
    {
      href: "/payroll/parameters",
      title: "Parámetros Legales",
      description: "Versiones de tasas, topes y tramos impositivos vigentes.",
      icon: FileText,
      color: "text-status-info-fg bg-status-info-soft",
    },
  ];

  return (
    <div className="space-y-6 min-w-0">
<PageHero
        icon={<Banknote />}
        iconTone="amber"
        title="Payroll"
        subtitle="liquidaciones y costeo"
        description="Sistema de liquidaciones y costeo para Chile."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-w-0">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <Surface elevation={1} padding="md" hoverable className="h-full">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-ds-md bg-primary/10 text-primary shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[14px] font-semibold text-ds-text-1">{item.title}</p>
                    <p className="text-[12px] text-ds-text-3 mt-0.5">{item.description}</p>
                  </div>
                </div>
              </Surface>
            </Link>
          );
        })}
      </div>

      {/* Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-primary">
            <Settings className="h-4 w-4" />
            Información del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
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
        </CardContent>
      </Card>
    </div>
  );
}
