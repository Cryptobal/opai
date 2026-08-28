import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { RoleFinancialAuditClient } from "@/components/configuracion/RoleFinancialAuditClient";
import { ShieldCheck } from "lucide-react";

export default async function RoleFinancialAuditPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Auditoría de acceso financiero"
      description="Matriz efectiva (post-lock) de quién ve cifras de la empresa. Un template no puede reabrir banca, caja, facturación ni negocios."
      icon={<ShieldCheck className="h-[18px] w-[18px]" />}
      backHref="/opai/configuracion/roles"
      backLabel="Roles y Permisos"
    >
      <RoleFinancialAuditClient />
    </ConfigPageLayout>
  );
}
