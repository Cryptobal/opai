import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import PsychConfigForm from "@/components/psych/dashboard/PsychConfigForm";
import PsychTemplatesForm from "@/components/psych/dashboard/PsychTemplatesForm";
import { Brain } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración · Psicolaboral" };

export default async function ConfigPsychPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/psicolaboral");
  }
  const enabled = await isTenantModuleEnabled(session.user.tenantId, "psych");
  if (!enabled) {
    redirect("/opai/configuracion");
  }
  const role = (session.user.role ?? "").toLowerCase();
  if (!["owner", "admin"].includes(role)) {
    redirect("/personas/psicolaboral");
  }

  return (
    <ConfigPageLayout
      title="Evaluación psicolaboral"
      description="Pesos por dimensión, umbrales de banda, reglas del tenant y plantillas de invitación."
      icon={<Brain className="h-[18px] w-[18px]" />}
    >
      <div className="space-y-8">
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
    </ConfigPageLayout>
  );
}
