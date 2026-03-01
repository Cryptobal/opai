import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader, ConfigBackLink } from "@/components/opai";
import { GlobalDocumentsClient } from "@/components/opai/GlobalDocumentsClient";

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
    <>
      <ConfigBackLink />
      <PageHeader
        title="Documentos Globales"
        description="Documentos compartidos en todas las instalaciones (OS10, manuales de seguridad, etc.)"
      />
      <GlobalDocumentsClient />
    </>
  );
}
