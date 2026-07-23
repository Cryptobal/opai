import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DetailHeader } from "@/components/opai-ds";
import { PayrollPeriodDetailClient } from "@/components/payroll/PayrollPeriodDetailClient";
interface Props {
  params: Promise<{ id: string }>;
}

export default async function PayrollPeriodDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/periodos");
  const { id } = await params;

  return (
    <div className="space-y-4 min-w-0">
      <DetailHeader title="Detalle del Período" backHref="/payroll/periodos" />
      <PayrollPeriodDetailClient periodId={id} />
    </div>
  );
}
