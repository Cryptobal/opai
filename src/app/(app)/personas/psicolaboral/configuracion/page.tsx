import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { PageHeader, Breadcrumb } from "@/components/opai";
import PsychConfigForm from "@/components/psych/dashboard/PsychConfigForm";
import PsychTemplatesForm from "@/components/psych/dashboard/PsychTemplatesForm";

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
      <section className="pt-4 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Plantillas de invitación
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Personaliza los mensajes que se envían al postulante por WhatsApp,
          email o SMS cuando generas una evaluación.
        </p>
        <PsychTemplatesForm />
      </section>
    </div>
  );
}
