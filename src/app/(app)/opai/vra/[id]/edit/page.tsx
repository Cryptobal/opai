import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VraReportWizardClient } from "@/components/vra/VraReportWizardClient";

export const dynamic = "force-dynamic";

export default async function VraReportEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/opai/login?callbackUrl=/opai/vra/${id}/edit`);
  const tenantId = session.user.tenantId;

  const report = await prisma.vraReport.findFirst({
    where: { id, tenantId },
    include: {
      installation: { select: { id: true, name: true, address: true, city: true } },
      visit: { select: { id: true, checkInAt: true } },
      userFindings: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      userPhotos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!report) redirect("/crm/installations");

  return <VraReportWizardClient report={JSON.parse(JSON.stringify(report))} />;
}
