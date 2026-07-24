import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { TenantAiProvidersConfig } from "@/components/tenant/TenantAiProvidersConfig";
import { TenantAiRoutingConfig } from "@/components/tenant/TenantAiRoutingConfig";
import { AgentesPageClient } from "@/components/agentes/AgentesPageClient";
import { Sparkles } from "lucide-react";

export default async function InteligenciaArtificialPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/inteligencia-artificial");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Proveedores de IA"
      description="Conecta tu propia API key (OpenAI, Anthropic, Google) y elige el modelo. Si no configuras un proveedor, se usa el proveedor por defecto de la plataforma."
      icon={<Sparkles className="h-[18px] w-[18px]" />}
    >
      <TenantAiProvidersConfig />

      <section className="mt-10 space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ds-text-1">Modelo por módulo</h2>
          <p className="text-[13px] text-ds-text-3">
            Elige qué proveedor y modelo usa cada módulo de la app (todos los módulos y submódulos).
            Los módulos sin override usan el modelo por defecto.
          </p>
        </div>
        <TenantAiRoutingConfig />
      </section>

      <section className="mt-10">
        <AgentesPageClient />
      </section>
    </ConfigPageLayout>
  );
}
