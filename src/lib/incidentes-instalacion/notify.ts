import { notify } from "@/lib/notifications/notify";
import {
  getGuardiasEnTurno,
  getOpsFallbackAdminIds,
  getSupervisoresInstalacion,
} from "./service";

type IncidenteNotifyTicket = {
  id: string;
  code: string;
  title: string;
  tenantId: string;
  installationId: string | null;
  installationName?: string | null;
  guardiaId?: string | null;
};

async function recipientsForInstallation(tenantId: string, installationId: string | null) {
  if (!installationId) {
    return {
      guards: [] as { id: string; name: string }[],
      supervisors: [] as { id: string; name: string }[],
      opsAdminIds: await getOpsFallbackAdminIds(tenantId),
    };
  }
  const [guards, supervisors] = await Promise.all([
    getGuardiasEnTurno(tenantId, installationId),
    getSupervisoresInstalacion(tenantId, installationId),
  ]);
  const opsAdminIds = supervisors.length === 0 ? await getOpsFallbackAdminIds(tenantId) : [];
  return { guards, supervisors, opsAdminIds };
}

export async function notifyIncidenteNuevo(ticket: IncidenteNotifyTicket): Promise<void> {
  const { guards, supervisors, opsAdminIds } = await recipientsForInstallation(
    ticket.tenantId,
    ticket.installationId,
  );
  const place = ticket.installationName ? ` en ${ticket.installationName}` : "";
  const body = `${ticket.title}${place}. Código ${ticket.code}.`;

  if (guards.length > 0) {
    await notify({
      tenantId: ticket.tenantId,
      type: "incidente_terreno_nuevo",
      audience: "guardia",
      targetIds: guards.map((g) => g.id),
      targetType: "GUARD",
      title: `Nuevo incidente${place}`,
      body,
      link: `/portal/incidentes/${ticket.id}`,
      data: { ticketId: ticket.id, code: ticket.code, source: "public_qr" },
      forceChannels: { push: true, bell: false },
    });
  }

  const adminIds = [...new Set([...supervisors.map((s) => s.id), ...opsAdminIds])];
  if (adminIds.length > 0) {
    await notify({
      tenantId: ticket.tenantId,
      type: "incidente_terreno_nuevo",
      audience: "admin",
      targetIds: adminIds,
      targetType: "ADMIN",
      title: `Nuevo incidente${place}`,
      body,
      link: `/ops/supervision/incidentes`,
      data: { ticketId: ticket.id, code: ticket.code, source: "public_qr" },
      forceChannels: { push: true, bell: true },
    });
  }
}

export async function notifyIncidenteCerrado(ticket: IncidenteNotifyTicket): Promise<void> {
  if (!ticket.installationId) return;
  const supervisors = await getSupervisoresInstalacion(ticket.tenantId, ticket.installationId);
  const adminIds =
    supervisors.length > 0
      ? supervisors.map((s) => s.id)
      : await getOpsFallbackAdminIds(ticket.tenantId);
  if (adminIds.length === 0) return;
  await notify({
    tenantId: ticket.tenantId,
    type: "incidente_terreno_cerrado",
    audience: "admin",
    targetIds: adminIds,
    targetType: "ADMIN",
    title: `Incidente cerrado · por validar (${ticket.code})`,
    body: ticket.title,
    link: `/ops/supervision/incidentes`,
    data: { ticketId: ticket.id, code: ticket.code },
    forceChannels: { push: true, bell: true },
  });
}

export async function notifyIncidenteValidado(
  ticket: IncidenteNotifyTicket,
  validatorName: string,
): Promise<void> {
  const { guards, supervisors } = await recipientsForInstallation(
    ticket.tenantId,
    ticket.installationId,
  );
  const guardIds = ticket.guardiaId
    ? [ticket.guardiaId]
    : guards.map((g) => g.id);
  if (guardIds.length > 0) {
    await notify({
      tenantId: ticket.tenantId,
      type: "incidente_terreno_validado",
      audience: "guardia",
      targetIds: guardIds,
      targetType: "GUARD",
      title: `Incidente ${ticket.code} validado`,
      body: `Supervisión confirmó el cierre (${validatorName}).`,
      link: `/portal/incidentes/${ticket.id}`,
      data: { ticketId: ticket.id, code: ticket.code },
      forceChannels: { push: true },
    });
  }
  const others = supervisors.map((s) => s.id).filter((id) => id !== ticket.guardiaId);
  if (others.length > 0) {
    await notify({
      tenantId: ticket.tenantId,
      type: "incidente_terreno_validado",
      audience: "admin",
      targetIds: others,
      targetType: "ADMIN",
      title: `Incidente ${ticket.code} validado por ${validatorName}`,
      body: ticket.title,
      link: `/ops/supervision/incidentes`,
      data: { ticketId: ticket.id, code: ticket.code },
    });
  }
}

export async function notifyIncidenteRechazado(
  ticket: IncidenteNotifyTicket,
  reason: string,
): Promise<void> {
  if (!ticket.guardiaId) return;
  await notify({
    tenantId: ticket.tenantId,
    type: "incidente_terreno_rechazado",
    audience: "guardia",
    targetIds: [ticket.guardiaId],
    targetType: "GUARD",
    title: `Incidente ${ticket.code} devuelto`,
    body: reason,
    link: `/portal/incidentes/${ticket.id}`,
    data: { ticketId: ticket.id, code: ticket.code },
    forceChannels: { push: true },
  });
}
