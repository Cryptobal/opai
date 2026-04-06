import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DocCategoriesClient } from "@/components/docs/DocCategoriesClient";
import { FolderTree } from "lucide-react";

export default async function CategoriasPlantillasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/categorias-plantillas");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "categorias")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Categorías de Plantillas"
      description="Gestiona las categorías por módulo para Gestión Documental (documentos y mails)"
      icon={<FolderTree className="h-[18px] w-[18px]" />}
    >
      <DocCategoriesClient />
    </ConfigPageLayout>
  );
}
