import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { Sparkles } from "lucide-react";

export default async function InteligenciaArtificialPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Inteligencia Artificial"
      description="La configuración de proveedores de IA es gestionada centralmente por el administrador de la plataforma OPAI."
      icon={<Sparkles className="h-[18px] w-[18px]" />}
    >
      <div className="rounded-xl border border-border bg-muted/30 p-8 text-center">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">
          Gestión centralizada
        </h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Los proveedores y API keys de IA se configuran a nivel de plataforma.
          Si necesitas realizar cambios, contacta al administrador de OPAI.
        </p>
      </div>
    </ConfigPageLayout>
  );
}
