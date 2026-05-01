import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHero } from "@/components/opai-ds";
import { CalendarDays } from "lucide-react";
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
      <PageHero
        icon={<CalendarDays />}
        iconTone="amber"
        eyebrow={["Payroll", "Períodos", "Detalle"]}
        title="Detalle del Período"
        subtitle="liquidaciones, asistencias y archivos"
        description="Detalle completo del período de pago."
      />
      <PayrollSubnav />
      <PayrollPeriodDetailClient periodId={id} />
    </div>
  );
}
