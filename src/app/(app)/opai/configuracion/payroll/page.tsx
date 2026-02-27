import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PayrollConfigTabs } from "@/components/payroll/PayrollConfigTabs";

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
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Configuración Payroll"
        description="Parámetros, bonos y supuestos para remuneraciones"
        backHref="/opai/configuracion"
        backLabel="Configuración"
      />
      <PayrollConfigTabs />
    </div>
  );
}
