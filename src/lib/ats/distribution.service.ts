import { prisma } from "@/lib/prisma";
import { getAtsConfig } from "@/lib/ats/config";

export type Canal =
  | "google_jobs"
  | "indeed"
  | "computrabajo"
  | "bumeran"
  | "talent"
  | "yapo"
  | "base_opai"
  | "laborum"
  | "linkedin"
  | "bne";

export async function publicarEnCanal(
  jobPostingId: string,
  canal: Canal,
  tenantId: string,
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const config = await getAtsConfig(tenantId);
    const channelCfg = config.channelConfigs?.[canal];

    if (!channelCfg?.enabled) {
      return { success: false, error: `Canal ${canal} no esta habilitado` };
    }

    switch (canal) {
      case "google_jobs":
        return await publicarGoogleJobs(jobPostingId);
      case "base_opai":
        return await notificarBaseInterna(jobPostingId);
      case "indeed":
      case "computrabajo":
      case "bumeran":
      case "talent":
        return {
          success: false,
          error: `Canal ${canal} requiere configuración de credenciales de partner. Registrado como pendiente.`,
        };
      case "yapo":
        return {
          success: false,
          error: "Yapo requiere publicación manual. Registrado para trazabilidad.",
        };
      default:
        return { success: false, error: `Canal desconocido: ${canal}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

async function publicarGoogleJobs(
  jobPostingId: string,
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const job = await prisma.atsJobPosting.findUnique({
    where: { id: jobPostingId },
    select: { jsonLdSlug: true, titulo: true, tenantId: true },
  });

  if (!job?.jsonLdSlug) {
    return { success: false, error: "Aviso sin slug público. Activa el aviso primero." };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: job.tenantId },
    select: { slug: true },
  });

  const url = `${process.env.NEXT_PUBLIC_SITE_URL || "https://opai.cl"}/empleos/${tenant?.slug}/${job.jsonLdSlug}`;

  // TODO: Implementar Google Indexing API con service account
  console.log(`[ATS] Google Jobs: URL lista para indexar: ${url}`);

  return { success: true, externalId: url };
}

async function notificarBaseInterna(
  jobPostingId: string,
): Promise<{ success: boolean; error?: string }> {
  // TODO: Integrar con push notification service existente
  console.log(`[ATS] Base interna: notificación pendiente para job ${jobPostingId}`);
  return { success: true };
}

export async function actualizarEstadoCanal(
  jobPostingId: string,
  canal: Canal,
  estado: string,
  opts?: { externalId?: string; errorDetalle?: string },
): Promise<void> {
  await prisma.atsDistributionChannel.upsert({
    where: { jobPostingId_canal: { jobPostingId, canal } },
    create: {
      jobPostingId,
      canal,
      activo: true,
      estado,
      publicadoAt: estado === "publicado" ? new Date() : undefined,
      externalId: opts?.externalId,
      errorDetalle: opts?.errorDetalle,
    },
    update: {
      estado,
      publicadoAt: estado === "publicado" ? new Date() : undefined,
      externalId: opts?.externalId,
      errorDetalle: opts?.errorDetalle,
      updatedAt: new Date(),
    },
  });
}
