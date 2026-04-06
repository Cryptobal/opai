import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PayrollConfigTabs } from "@/components/payroll/PayrollConfigTabs";
import { Calculator } from "lucide-react";

export default async function PayrollConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/payroll");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "payroll")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Payroll"
      description="Parámetros, bonos y supuestos para remuneraciones"
      icon={<Calculator className="h-[18px] w-[18px]" />}
    >
      <PayrollConfigTabs />
    </ConfigPageLayout>
  );
}
