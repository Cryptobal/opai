import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { PayrollPeriodListClient } from "@/components/payroll/PayrollPeriodListClient";

export default async function PayrollPeriodosPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/periodos");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Períodos de Pago"
        description="Gestión de liquidaciones mensuales"
      />
      <PayrollSubnav />
      <PayrollPeriodListClient />
    </div>
  );
}
