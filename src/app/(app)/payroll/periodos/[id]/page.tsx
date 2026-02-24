import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { PayrollPeriodDetailClient } from "@/components/payroll/PayrollPeriodDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PayrollPeriodDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/periodos");
  const { id } = await params;

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Detalle del Período"
        description="Liquidaciones, asistencias y archivos"
      />
      <PayrollSubnav />
      <PayrollPeriodDetailClient periodId={id} />
    </div>
  );
}
