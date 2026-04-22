import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { EmpresaConfigTabs } from "@/components/configuracion/EmpresaConfigTabs";
import { Building } from "lucide-react";

export const metadata = { title: "Empresa — Configuración" };

export default async function EmpresaConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/empresa");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Empresa"
      description="Datos de la empresa empleadora. Estos datos se usan como tokens en contratos, finiquitos, cartas de aviso y otros documentos laborales."
      icon={<Building className="h-[18px] w-[18px]" />}
    >
      <EmpresaConfigTabs />
    </ConfigPageLayout>
  );
}
