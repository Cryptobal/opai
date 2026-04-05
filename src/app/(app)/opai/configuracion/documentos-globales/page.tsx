import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { GlobalDocumentsClient } from "@/components/opai/GlobalDocumentsClient";
import { FileText } from "lucide-react";

export const metadata = { title: "Documentos Globales — Configuración" };

export default async function GlobalDocumentsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/documentos-globales");
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "owner") {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Documentos Globales"
      description="Documentos compartidos en todas las instalaciones (OS10, manuales de seguridad, etc.)"
      icon={FileText}
    >
      <GlobalDocumentsClient />
    </ConfigPageLayout>
  );
}
