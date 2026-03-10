import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type GuardChatSession = {
  guardiaId: string;
  tenantId: string;
  guardiaName: string;
};

export type ClientChatSession = {
  contactId: string;
  tenantId: string;
  accountId: string;
  contactName: string;
};

export function getGuardSession(request: NextRequest): GuardChatSession | null {
  const guardiaId = request.headers.get("x-guardia-id");
  const tenantId = request.headers.get("x-tenant-id");
  const rawGuardiaName = request.headers.get("x-guardia-name") || "Guardia";
  const guardiaName = decodeURIComponent(rawGuardiaName);
  if (!guardiaId || !tenantId) return null;
  return { guardiaId, tenantId, guardiaName };
}

export function getClientSession(request: NextRequest): ClientChatSession | null {
  const contactId = request.headers.get("x-contact-id");
  const tenantId = request.headers.get("x-tenant-id");
  const accountId = request.headers.get("x-account-id");
  const rawContactName = request.headers.get("x-contact-name") || "Cliente";
  const contactName = decodeURIComponent(rawContactName);
  if (!contactId || !tenantId || !accountId) return null;
  return { contactId, tenantId, accountId, contactName };
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

export async function verifyClientChannelAccess(accountId: string, channelId: string): Promise<boolean> {
  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    select: { installationId: true },
  });
  if (!channel || !channel.installationId) return false;

  // Check if the installation belongs to the client's account
  const installation = await prisma.crmInstallation.findFirst({
    where: { id: channel.installationId, accountId },
  });
  return !!installation;
}
