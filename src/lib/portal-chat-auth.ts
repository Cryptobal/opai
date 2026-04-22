import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type GuardChatSession = {
  guardiaId: string;
  tenantId: string;
  guardiaName: string;
};

export function getGuardSession(request: NextRequest): GuardChatSession | null {
  const guardiaId = request.headers.get("x-guardia-id");
  const tenantId = request.headers.get("x-tenant-id");
  const rawGuardiaName = request.headers.get("x-guardia-name") || "Guardia";
  const guardiaName = decodeURIComponent(rawGuardiaName);
  if (!guardiaId || !tenantId) return null;
  return { guardiaId, tenantId, guardiaName };
}

export async function verifyGuardChannelAccess(guardiaId: string, channelId: string): Promise<boolean> {
  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    select: { installationId: true },
  });
  if (!channel) return false;

  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: { currentInstallationId: true, asignaciones: { where: { isActive: true }, select: { installationId: true } } },
  });
  if (!guardia) return false;

  // Guard has access if currentInstallation matches OR has active assignment
  if (guardia.currentInstallationId === channel.installationId) return true;
  return guardia.asignaciones.some(a => a.installationId === channel.installationId);
}

export async function verifyClientChannelAccess(
  accountId: string,
  channelId: string,
  contactId?: string,
  tenantId?: string
): Promise<boolean> {
  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      channelType: true,
      installationId: true,
      accountId: true,
      tenantId: true,
    },
  });
  if (!channel) return false;

  // EXTERNAL: canal prospecto/ejecutivo — verificar accountId y que el contacto sea participante
  if (channel.channelType === "EXTERNAL" && channel.accountId) {
    if (channel.accountId !== accountId) return false;
    if (contactId) {
      const participant = await prisma.chatChannelParticipant.findFirst({
        where: {
          channelId,
          participantType: "CONTACT",
          participantId: contactId,
        },
      });
      return !!participant;
    }
    return true;
  }

  // GROUP: canal predefinido por tenant (p. ej. "Equipo Comercial") — todos los
  // clientes del mismo tenant tienen acceso. Requiere tenantId para evitar
  // filtración cross-tenant.
  if (channel.channelType === "GROUP") {
    if (!tenantId) return false;
    return channel.tenantId === tenantId;
  }

  // INSTALLATION: canal de instalación — verificar que la instalación pertenezca a la cuenta
  if (!channel.installationId) return false;
  const installation = await prisma.crmInstallation.findFirst({
    where: { id: channel.installationId, accountId },
  });
  return !!installation;
}
