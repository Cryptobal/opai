import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { ConfigSubnav, EmailTemplatesClient } from "@/components/opai";

export default async function EmailTemplatesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/email-templates");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/hub");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const templates = await prisma.crmEmailTemplate.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  const initialTemplates = JSON.parse(JSON.stringify(templates));

  return (
    <>
      <PageHeader
        title="Templates de email"
        description="Crea templates con placeholders para seguimiento"
        className="mb-6"
      />
      <ConfigSubnav />
      <EmailTemplatesClient initialTemplates={initialTemplates} />
    </>
  );
}
