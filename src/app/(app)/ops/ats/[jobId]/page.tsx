import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Briefcase } from "lucide-react";
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

  const [job, atsConfig, tenantRow, installations] = await Promise.all([
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
    prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { slug: true },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, commune: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!job) notFound();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://opai.cl";
  const publicJobUrl =
    tenantRow?.slug && job.jsonLdSlug
      ? `${siteUrl.replace(/\/$/, "")}/empleos/${tenantRow.slug}/${job.jsonLdSlug}`
      : null;

  // Build enabled manual channels list for the job distribution UI
  const enabledManualChannels = Object.entries(atsConfig.channelConfigs ?? {})
    .filter(([, cfg]) => cfg.enabled && cfg.tipo === "manual_link")
    .map(([key, cfg]) => ({ key, label: cfg.label }));

  return (
    <div className="space-y-6 min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <PageHero
        icon={<Briefcase />}
        iconTone="emerald"
        eyebrow={["Operaciones", "ATS", job.titulo]}
        title={job.titulo}
        subtitle="detalle y pipeline"
        description={`${job.turno} · ${job.region} · ${job.applications.length} postulantes`}
      />
      <AtsPipelineClient
        job={JSON.parse(JSON.stringify(job))}
        manualChannels={enabledManualChannels}
        publicJobUrl={publicJobUrl}
        tenantSlug={tenantRow?.slug ?? ""}
        installations={JSON.parse(JSON.stringify(installations))}
      />
    </div>
  );
}
