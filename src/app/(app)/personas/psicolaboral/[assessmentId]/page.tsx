import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { prisma } from "@/lib/prisma";
import { PageHeader, Breadcrumb } from "@/components/opai";
import PsychAssessmentDetail from "@/components/psych/dashboard/PsychAssessmentDetail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ assessmentId: string }>;
}

export default async function PsychDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login");
  const tenantId = session.user.tenantId;
  const enabled = await isTenantModuleEnabled(tenantId, "psych");
  if (!enabled) redirect("/personas/psicolaboral");

  const { assessmentId } = await params;
  const assessment = await prisma.psychAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: { result: true, version: { select: { name: true } } },
  });
  if (!assessment) redirect("/personas/psicolaboral");

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Inicio", href: "/hub" },
          { label: "Psicolaboral", href: "/personas/psicolaboral" },
          { label: assessment.targetName },
        ]}
        className="mb-2"
      />
      <PageHeader
        title={assessment.targetName}
        description={`Test: ${assessment.version.name} · Estado: ${assessment.status}`}
      />
      <PsychAssessmentDetail assessmentId={assessmentId} />
    </div>
  );
}
