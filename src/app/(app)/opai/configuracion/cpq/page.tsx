import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { ConfigSubnav } from "@/components/opai";
import { CpqCatalogConfig } from "@/components/cpq/CpqCatalogConfig";

export default async function CpqConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/cpq");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/hub");
  }

  return (
    <>
      <PageHeader
        title="Configuración CPQ"
        description="Catálogo y parámetros de pricing"
        className="mb-6"
      />
      <ConfigSubnav />
      <div className="grid gap-4">
        <CpqCatalogConfig showHeader={false} />
      </div>
    </>
  );
}
