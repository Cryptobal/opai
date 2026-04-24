import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { PageHeader, Breadcrumb } from "@/components/opai";
import PsychConfigForm from "@/components/psych/dashboard/PsychConfigForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración psicolaboral" };

export default async function PsychConfigPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");
  const enabled = await isTenantModuleEnabled(session.user.tenantId, "psych");
  if (!enabled) redirect("/personas/psicolaboral");

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Inicio", href: "/hub" },
          { label: "Psicolaboral", href: "/personas/psicolaboral" },
          { label: "Configuración" },
        ]}
        className="mb-2"
      />
      <PageHeader
        title="Configuración del módulo"
        description="Ajusta pesos por dimensión, umbrales de banda y reglas del tenant."
      />
      <PsychConfigForm />
    </div>
  );
}
