import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHero } from "@/components/opai-ds";
import { CalendarDays } from "lucide-react";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { PayrollPeriodListClient } from "@/components/payroll/PayrollPeriodListClient";

export default async function PayrollPeriodosPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/periodos");

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<CalendarDays />}
        iconTone="amber"
        eyebrow={["Payroll", "Períodos"]}
        title="Períodos de Pago"
        subtitle="liquidaciones mensuales"
        description="Gestión de liquidaciones mensuales."
      />
      <PayrollSubnav />
      <PayrollPeriodListClient />
    </div>
  );
}
