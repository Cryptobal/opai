import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { PageHeader, Breadcrumb } from "@/components/opai";
import PsychDashboardClient from "@/components/psych/dashboard/PsychDashboardClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evaluación psicolaboral" };

export default async function PsychHomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/personas/psicolaboral");
  }
  const enabled = await isTenantModuleEnabled(session.user.tenantId, "psych");
  if (!enabled) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Módulo Psicolaboral</h1>
        <p className="text-slate-600">
          Este módulo no está habilitado en tu plan. Actívalo desde la
          configuración de módulos.
        </p>
        <a
          href="/opai/modulos"
          className="inline-block rounded-xl bg-slate-900 text-white px-4 py-3"
        >
          Activar módulo
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <Breadcrumb
        items={[
          { label: "Inicio", href: "/hub" },
          { label: "Personas", href: "/personas/guardias" },
          { label: "Psicolaboral" },
        ]}
        className="mb-2"
      />
      <PageHeader
        title="Evaluación psicolaboral"
        description="Screening interno de aptitud para guardias de seguridad. Complemento al informe OS-10."
      />
      <PsychDashboardClient />
    </div>
  );
}
