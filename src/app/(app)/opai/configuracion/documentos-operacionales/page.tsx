import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { GlobalDocumentsClient } from "@/components/opai/GlobalDocumentsClient";
import { FileText } from "lucide-react";
import { resolvePermissions } from "@/lib/permissions-server";
import { canView } from "@/lib/permissions";

export const metadata = { title: "Documentos Operacionales — Configuración" };

export default async function OperationalDocumentsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/documentos-operacionales");
  }

  const perms = await resolvePermissions({
    role: session.user.role,
    roleTemplateId: session.user.roleTemplateId,
  });
  if (!canView(perms, "config", "documentos_operacionales")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Documentos Operacionales"
      description="Tipos de documentos operativos que se controlan a nivel empresa (Global), por instalación o para guardias."
      icon={<FileText className="h-[18px] w-[18px]" />}
    >
      <GlobalDocumentsClient />
    </ConfigPageLayout>
  );
}
