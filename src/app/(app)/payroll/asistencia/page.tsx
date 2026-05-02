import { PageHero } from "@/components/opai-ds";
import { ClipboardCheck } from "lucide-react";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { PayrollAsistenciaCierreClient } from "@/components/payroll/PayrollAsistenciaCierreClient";

export default function PayrollAsistenciaPage() {
  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<ClipboardCheck />}
        iconTone="amber"
        eyebrow={["Payroll", "Cierre de Asistencia"]}
        title="Cierre de Asistencia"
        subtitle="verificación previa a nómina"
        description="Verifica y cierra el período de asistencia antes de procesar nómina."
      />
      <PayrollSubnav />
      <PayrollAsistenciaCierreClient />
    </div>
  );
}
