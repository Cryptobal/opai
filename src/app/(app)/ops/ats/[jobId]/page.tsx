import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { AtsPipelineClient } from "@/components/ats/AtsPipelineClient";
import { getAtsConfig } from "@/lib/ats/config";

export default async function AtsPipelinePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/ats");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "ats")) {
    redirect("/hub");
  }

  const { jobId } = await params;
  const tenantId = session.user.tenantId;

  const [job, atsConfig] = await Promise.all([
    prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId },
      include: {
        installation: { select: { id: true, name: true } },
        channels: true,
        applications: {
          include: {
            guardia: {
              select: {
                id: true,
                code: true,
                os10: true,
                os10ExpiresAt: true,
                experienciaAnios: true,
                turnosDisponibles: true,
                lifecycleStatus: true,
                persona: {
                  select: {
                    firstName: true,
                    lastName: true,
                    rut: true,
                    sex: true,
                    commune: true,
                    region: true,
                  },
                },
              },
            },
          },
          orderBy: { matchScore: "desc" },
        },
      },
    }),
    getAtsConfig(tenantId),
  ]);

  if (!job) notFound();

  // Build enabled manual channels list for the job distribution UI
  const enabledManualChannels = Object.entries(atsConfig.channelConfigs ?? {})
    .filter(([, cfg]) => cfg.enabled && cfg.tipo === "manual_link")
    .map(([key, cfg]) => ({ key, label: cfg.label }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title={job.titulo}
        description={`${job.turno} · ${job.region} · ${job.applications.length} postulantes`}
        backHref="/ops/ats"
        backLabel="ATS"
      />
      <AtsPipelineClient
        job={JSON.parse(JSON.stringify(job))}
        manualChannels={enabledManualChannels}
      />
    </div>
  );
}
