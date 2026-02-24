import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { AnticipoProcessClient } from "@/components/payroll/AnticipoProcessClient";

export default async function PayrollAnticiposPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/anticipos");

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Anticipos"
        description="Procesos de pago de anticipos mensuales"
      />
      <PayrollSubnav />
      <AnticipoProcessClient />
    </div>
  );
}
