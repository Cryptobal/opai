/**
 * Resolución de variables para plantillas de email de onboarding y comunicaciones.
 * Obtiene datos del guardia, sitio, cliente y supervisor.
 */

import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl, getTenantSiteUrl } from "@/lib/emails/site-url";

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getBaseUrl(tenantSlug?: string | null): string {
  return tenantSlug ? getTenantSiteUrl(tenantSlug) : getCanonicalSiteUrl();
}

export async function resolveVariables(
  guardiaId: string
): Promise<Record<string, string>> {
  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    include: {
      persona: true,
      currentInstallation: {
        include: {
          account: true,
          supervisorAssignments: {
            where: { isActive: true },
            take: 1,
            orderBy: { startDate: "desc" },
            include: {
              supervisor: { select: { name: true, email: true } },
            },
          },
        },
      },
      asignaciones: {
        where: { isActive: true },
        take: 1,
        orderBy: { startDate: "desc" },
        include: {
          puesto: { include: { cargo: { select: { name: true } } } },
        },
      },
    },
  });

  if (!guardia) {
    const baseUrl = getBaseUrl();
    return {
      nombre: "",
      primerNombre: "",
      pin: "Sin PIN asignado",
      email: "",
      rut: "",
      cargo: "",
      sitio: "",
      cliente: "",
      supervisor: "",
      fechaInicio: "",
      portalGuardia: `${baseUrl}/portal/guardia`,
      portalRondas: `${baseUrl}/portal/rondas`,
      portalAcceso: `${baseUrl}/portal/acceso`,
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: guardia.tenantId },
    select: { slug: true },
  });
  const baseUrl = getBaseUrl(tenant?.slug ?? null);

  const persona = guardia.persona;
  const nombre = [persona.firstName, persona.lastName].filter(Boolean).join(" ");
  const email =
    guardia.personalEmail ?? persona.personalEmail ?? persona.email ?? "";

  const sitio = guardia.currentInstallation?.name ?? "";
  const cliente = guardia.currentInstallation?.account?.name ?? "";

  const supervisor =
    guardia.currentInstallation?.supervisorAssignments[0]?.supervisor?.name ??
    "";

  const cargo =
    guardia.asignaciones[0]?.puesto?.cargo?.name ?? "Guardia de Seguridad";

  const pin = guardia.marcacionPinVisible ?? "Sin PIN asignado";

  const fechaInicio = formatDate(guardia.hiredAt);

  return {
    nombre,
    primerNombre: persona.firstName ?? "",
    pin,
    email,
    rut: persona.rut ?? "",
    cargo,
    sitio,
    cliente,
    supervisor,
    fechaInicio,
    portalGuardia: `${baseUrl}/portal/guardia`,
    portalRondas: `${baseUrl}/portal/rondas`,
    portalAcceso: `${baseUrl}/portal/acceso`,
  };
}

/**
 * Reemplaza variables {{variable}} en un texto con los valores proporcionados.
 */
export function replaceVariables(
  text: string,
  variables: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return variables[key] ?? `{{${key}}}`;
  });
}
