import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { TenantSignersSettings } from "@/components/docs/laborales/TenantSignersSettings";
import { PageHero } from "@/components/opai-ds";
import { Stamp } from "lucide-react";

export default async function LaboralesConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/laborales/configurar");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "laborales")) {
    redirect("/opai/documentos/laborales");
  }
  return (
    <div className="ds-page-enter space-y-6">
      <PageHero
        icon={<Stamp className="h-5 w-5" />}
        iconTone="rose"
        title="Firmantes de empresa"
        subtitle="configurar"
        description="Registra la firma del representante legal y del prevencionista para auto-estampado."
      />
      <TenantSignersSettings />
    </div>
  );
}
