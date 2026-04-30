import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai-ds";
import { AtsCreateJobClient, type AtsJobEditData } from "@/components/ats/AtsCreateJobClient";
import { getAtsSnippets } from "@/lib/ats/snippets";

export default async function AtsEditarPage({
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

  const [job, installations, snippets] = await Promise.all([
    prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, commune: true, lat: true, lng: true },
      orderBy: { name: "asc" },
    }),
    getAtsSnippets(tenantId),
  ]);

  if (!job) {
    notFound();
  }

  const initialData: AtsJobEditData = {
    titulo: job.titulo,
    descripcion: job.descripcion,
    turno: job.turno,
    region: job.region,
    commune: job.commune,
    installationId: job.installationId,
    rentaMin: job.rentaMin,
    rentaMax: job.rentaMax,
    vacantes: job.vacantes,
    requiereOS10: job.requiereOS10,
    requiereMovilizacion: job.requiereMovilizacion,
    genero: job.genero,
    experienciaMinAnios: job.experienciaMinAnios,
    funciones: job.funciones,
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Editar aviso de empleo"
        description="Modifica los datos del aviso publicado."
        backHref="/ops/ats"
        backLabel="ATS"
      />
      <AtsCreateJobClient
        mode="edit"
        jobId={jobId}
        initialData={initialData}
        installations={JSON.parse(JSON.stringify(installations))}
        snippets={snippets}
      />
    </div>
  );
}
