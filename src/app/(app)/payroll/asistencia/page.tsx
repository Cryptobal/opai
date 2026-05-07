import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { ClipboardCheck } from "lucide-react";
import { PayrollAsistenciaCierreClient } from "@/components/payroll/PayrollAsistenciaCierreClient";

export default function PayrollAsistenciaPage() {
  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="payroll" />
      <PageHero
        icon={<ClipboardCheck />}
        iconTone="amber"
        title="Cierre de Asistencia"
        subtitle="verificación previa a nómina"
        description="Verifica y cierra el período de asistencia antes de procesar nómina."
      />
      <PayrollAsistenciaCierreClient />
    </div>
  );
}
