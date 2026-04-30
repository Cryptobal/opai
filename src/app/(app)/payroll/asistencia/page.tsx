import { PageHeader } from "@/components/opai-ds";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { PayrollAsistenciaCierreClient } from "@/components/payroll/PayrollAsistenciaCierreClient";

export default function PayrollAsistenciaPage() {
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Cierre de Asistencia"
        description="Verifica y cierra el período de asistencia antes de procesar nómina"
      />
      <PayrollSubnav />
      <PayrollAsistenciaCierreClient />
    </div>
  );
}
