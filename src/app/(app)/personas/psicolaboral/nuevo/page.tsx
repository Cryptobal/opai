import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { PageHeader, Breadcrumb } from "@/components/opai";
import PsychCreateForm from "@/components/psych/dashboard/PsychCreateForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva evaluación psicolaboral" };

export default async function PsychCreatePage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/personas/psicolaboral/nuevo");
  const enabled = await isTenantModuleEnabled(session.user.tenantId, "psych");
  if (!enabled) redirect("/personas/psicolaboral");

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Inicio", href: "/hub" },
          { label: "Psicolaboral", href: "/personas/psicolaboral" },
          { label: "Nueva evaluación" },
        ]}
        className="mb-2"
      />
      <PageHeader
        title="Nueva evaluación"
        description="Envía un link al candidato para que responda el test desde su celular."
      />
      <PsychCreateForm />
    </div>
  );
}
