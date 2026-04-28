import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { TenantAiProvidersConfig } from "@/components/tenant/TenantAiProvidersConfig";
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
    </ConfigPageLayout>
  );
}
