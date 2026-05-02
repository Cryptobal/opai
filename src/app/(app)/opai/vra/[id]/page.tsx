import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VraReportViewerClient } from "@/components/vra/VraReportViewerClient";

export const dynamic = "force-dynamic";

export default async function VraReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/opai/login?callbackUrl=/opai/vra/${id}`);
  const tenantId = session.user.tenantId;

  const report = await prisma.vraReport.findFirst({
    where: { id, tenantId },
    include: {
      installation: { select: { id: true, name: true, address: true, city: true } },
      sections: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!report) redirect("/crm/installations");

  return <VraReportViewerClient report={JSON.parse(JSON.stringify(report))} />;
}
