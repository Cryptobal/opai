import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { CalendarDays } from "lucide-react";
import { PayrollPeriodListClient } from "@/components/payroll/PayrollPeriodListClient";

export default async function PayrollPeriodosPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/periodos");

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="payroll" />
      <PageHero
        icon={<CalendarDays />}
        iconTone="amber"
        eyebrow={["Payroll", "Períodos"]}
        title="Períodos de Pago"
        subtitle="liquidaciones mensuales"
        description="Gestión de liquidaciones mensuales."
      />
      <PayrollPeriodListClient />
    </div>
  );
}
