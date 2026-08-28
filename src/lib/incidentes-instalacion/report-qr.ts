import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { haversineDistance } from "@/lib/marcacion";
import { IncidenteError } from "./errors";
import { generateReportToken, truncateToken } from "./tokens";
import {
  REPORT_QR_EVENT,
  REPORT_QR_STATUS,
  assertLoteQuantity,
  formatLoteCode,
  formatSerialLabel,
  nextLoteSeqFromCodes,
  type ReportQrStatus,
} from "./qr-labels";
export type ReportChannelInstallation = {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  city: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
  geoRadiusM: number;
  isActive: boolean;
  status: string;
  publicReportEnabled: boolean;
  publicReportToken: string | null;
  tenantName: string;
  reportQrId?: string;
  serialLabel?: string | null;
};

const QR_SELECT = {
  id: true,
  tenantId: true,
  loteId: true,
  serial: true,
  serialLabel: true,
  token: true,
  status: true,
  installationId: true,
  assignedAt: true,
  assignedBy: true,
  retiredAt: true,
  retiredBy: true,
  retiredReason: true,
  createdAt: true,
  lote: { select: { id: true, code: true } },
  installation: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      commune: true,
      lat: true,
      lng: true,
      geoRadiusM: true,
      isActive: true,
      status: true,
      publicReportEnabled: true,
      publicReportToken: true,
    },
  },
} satisfies Prisma.OpsReportQrSelect;

export type ReportQrRow = Prisma.OpsReportQrGetPayload<{ select: typeof QR_SELECT }>;

const INSTALLATION_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  address: true,
  city: true,
  commune: true,
  lat: true,
  lng: true,
  geoRadiusM: true,
  isActive: true,
  status: true,
  publicReportEnabled: true,
  publicReportToken: true,
} satisfies Prisma.CrmInstallationSelect;

async function tenantNameOf(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? "Seguridad";
}

function mapInstallation(
  row: Prisma.CrmInstallationGetPayload<{ select: typeof INSTALLATION_SELECT }>,
  tenantName: string,
  extra?: { reportQrId?: string; serialLabel?: string | null },
): ReportChannelInstallation {
  return { ...row, tenantName, reportQrId: extra?.reportQrId, serialLabel: extra?.serialLabel ?? null };
}

export type ReportQrLookup =
  | { kind: "missing" }
  | { kind: "retired"; tenantName: string; serialLabel: string }
  | { kind: "unassigned"; tenantName: string; qr: ReportQrRow }
  | { kind: "assigned"; tenantName: string; qr: ReportQrRow; installation: ReportChannelInstallation };

export async function lookupReportQr(token: string): Promise<ReportQrLookup> {
  if (!token || token.length < 16) return { kind: "missing" };

  const qr = await prisma.opsReportQr.findUnique({
    where: { token },
    select: QR_SELECT,
  });

  if (qr) {
    const tenantName = await tenantNameOf(qr.tenantId);
    if (qr.status === REPORT_QR_STATUS.retired) {
      return { kind: "retired", tenantName, serialLabel: qr.serialLabel };
    }
    if (qr.status === REPORT_QR_STATUS.unassigned || !qr.installationId) {
      return { kind: "unassigned", tenantName, qr };
    }
    const inst = qr.installation;
    if (!inst) return { kind: "unassigned", tenantName, qr };
    return {
      kind: "assigned",
      tenantName,
      qr,
      installation: mapInstallation(
        { ...inst, tenantId: qr.tenantId },
        tenantName,
        { reportQrId: qr.id, serialLabel: qr.serialLabel },
      ),
    };
  }

  const legacy = await prisma.crmInstallation.findUnique({
    where: { publicReportToken: token },
    select: INSTALLATION_SELECT,
  });
  if (!legacy) return { kind: "missing" };
  const tenantName = await tenantNameOf(legacy.tenantId);
  return {
    kind: "assigned",
    tenantName,
    qr: {
      id: `legacy:${legacy.id}`,
      tenantId: legacy.tenantId,
      loteId: "",
      serial: 0,
      serialLabel: "QR-LEGACY",
      token,
      status: REPORT_QR_STATUS.assigned,
      installationId: legacy.id,
      assignedAt: null,
      assignedBy: null,
      retiredAt: null,
      retiredBy: null,
      retiredReason: null,
      createdAt: new Date(0),
      lote: { id: "", code: "LEGACY" },
      installation: legacy,
    },
    installation: mapInstallation(legacy, tenantName, { serialLabel: null }),
  };
}

export function publicQrUrl(token: string): string {
  return `${getCanonicalSiteUrl()}/r/${token}`;
}

export async function generateReportQrLote(opts: {
  tenantId: string;
  actorId: string;
  quantity: number;
  note?: string | null;
}): Promise<{ loteId: string; code: string; quantity: number; qrs: { id: string; serialLabel: string }[] }> {
  assertLoteQuantity(opts.quantity);
  const note = opts.note?.trim() || null;

  const existing = await prisma.opsReportQrLote.findMany({
    where: { tenantId: opts.tenantId },
    select: { code: true },
  });
  const code = formatLoteCode(nextLoteSeqFromCodes(existing.map((r) => r.code)));

  const agg = await prisma.opsReportQr.aggregate({
    where: { tenantId: opts.tenantId },
    _max: { serial: true },
  });
  const startSerial = (agg._max.serial ?? 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const lote = await tx.opsReportQrLote.create({
      data: {
        tenantId: opts.tenantId,
        code,
        quantity: opts.quantity,
        note,
        createdBy: opts.actorId,
      },
      select: { id: true, code: true, quantity: true },
    });

    const rows: { id: string; serialLabel: string }[] = [];
    for (let i = 0; i < opts.quantity; i++) {
      const serial = startSerial + i;
      const serialLabel = formatSerialLabel(serial);
      const token = generateReportToken();
      const qr = await tx.opsReportQr.create({
        data: {
          tenantId: opts.tenantId,
          loteId: lote.id,
          serial,
          serialLabel,
          token,
          status: REPORT_QR_STATUS.unassigned,
        },
        select: { id: true, serialLabel: true },
      });
      rows.push(qr);
    }
    return { lote, qrs: rows };
  });

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "CREATE",
    entity: "OpsReportQrLote",
    entityId: created.lote.id,
    details: { code: created.lote.code, quantity: created.lote.quantity },
  });

  return {
    loteId: created.lote.id,
    code: created.lote.code,
    quantity: created.lote.quantity,
    qrs: created.qrs,
  };
}

async function loadQrForTenant(tenantId: string, qrId: string): Promise<ReportQrRow> {
  const qr = await prisma.opsReportQr.findFirst({
    where: { id: qrId, tenantId },
    select: QR_SELECT,
  });
  if (!qr) throw new IncidenteError("NOT_FOUND", "QR no encontrado", 404);
  return qr;
}

async function loadAssignableInstallation(tenantId: string, installationId: string) {
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: INSTALLATION_SELECT,
  });
  if (!inst) throw new IncidenteError("NOT_FOUND", "Instalación no encontrada", 404);
  if (inst.lat == null || inst.lng == null) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "La instalación necesita coordenadas GPS antes de asignar un QR de reportes.",
      422,
    );
  }
  if (!inst.isActive || inst.status !== "active") {
    throw new IncidenteError("VALIDATION_ERROR", "La instalación no está activa.", 422);
  }
  return inst;
}

async function syncPrimaryToken(installationId: string): Promise<void> {
  const primary = await prisma.opsReportQr.findFirst({
    where: { installationId, status: REPORT_QR_STATUS.assigned },
    orderBy: { assignedAt: "desc" },
    select: { token: true },
  });
  await prisma.crmInstallation.update({
    where: { id: installationId },
    data: { publicReportToken: primary?.token ?? null },
  });
}

export async function assignReportQr(opts: {
  tenantId: string;
  qrId: string;
  installationId: string;
  actorId: string;
  actorKind?: "erp" | "device";
  note?: string | null;
}): Promise<ReportQrRow> {
  const qr = await loadQrForTenant(opts.tenantId, opts.qrId);
  if (qr.status === REPORT_QR_STATUS.retired) {
    throw new IncidenteError("TOKEN_INVALID", "Este QR fue retirado.", 409);
  }
  const inst = await loadAssignableInstallation(opts.tenantId, opts.installationId);
  const now = new Date();
  const isReassign = qr.status === REPORT_QR_STATUS.assigned && qr.installationId !== inst.id;
  const alreadyThere = qr.status === REPORT_QR_STATUS.assigned && qr.installationId === inst.id;
  if (alreadyThere) return qr;

  const prevInstallationId = qr.installationId;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opsReportQr.update({
      where: { id: qr.id },
      data: {
        status: REPORT_QR_STATUS.assigned,
        installationId: inst.id,
        assignedAt: now,
        assignedBy: opts.actorId,
      },
      select: QR_SELECT,
    });
    await tx.opsReportQrEvent.create({
      data: {
        tenantId: opts.tenantId,
        qrId: qr.id,
        action: isReassign ? REPORT_QR_EVENT.reassign : REPORT_QR_EVENT.assign,
        installationId: inst.id,
        actorId: opts.actorId,
        actorKind: opts.actorKind ?? "erp",
        note: opts.note ?? (isReassign ? `Desde ${prevInstallationId}` : null),
      },
    });
    await tx.crmInstallation.update({
      where: { id: inst.id },
      data: {
        publicReportEnabled: true,
        publicReportToken: qr.token,
        publicReportTokenRotatedAt: inst.publicReportToken ? undefined : now,
      },
    });
    return row;
  });

  if (prevInstallationId && prevInstallationId !== inst.id) {
    await syncPrimaryToken(prevInstallationId);
  }

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "UPDATE",
    entity: "OpsReportQr",
    entityId: qr.id,
    details: {
      action: isReassign ? "reassign" : "assign",
      serial: qr.serialLabel,
      token: truncateToken(qr.token),
      installationId: inst.id,
    },
  });

  return updated;
}

export async function unassignReportQr(opts: {
  tenantId: string;
  qrId: string;
  actorId: string;
  actorKind?: "erp" | "device";
}): Promise<ReportQrRow> {
  const qr = await loadQrForTenant(opts.tenantId, opts.qrId);
  if (qr.status === REPORT_QR_STATUS.retired) {
    throw new IncidenteError("TOKEN_INVALID", "Este QR fue retirado.", 409);
  }
  if (qr.status === REPORT_QR_STATUS.unassigned) return qr;
  const prevInstallationId = qr.installationId;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opsReportQr.update({
      where: { id: qr.id },
      data: {
        status: REPORT_QR_STATUS.unassigned,
        installationId: null,
        assignedAt: null,
        assignedBy: null,
      },
      select: QR_SELECT,
    });
    await tx.opsReportQrEvent.create({
      data: {
        tenantId: opts.tenantId,
        qrId: qr.id,
        action: REPORT_QR_EVENT.unassign,
        installationId: prevInstallationId,
        actorId: opts.actorId,
        actorKind: opts.actorKind ?? "erp",
      },
    });
    return row;
  });

  if (prevInstallationId) await syncPrimaryToken(prevInstallationId);

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "UPDATE",
    entity: "OpsReportQr",
    entityId: qr.id,
    details: { action: "unassign", serial: qr.serialLabel, token: truncateToken(qr.token) },
  });

  return updated;
}

export async function retireReportQr(opts: {
  tenantId: string;
  qrId: string;
  actorId: string;
  reason?: string | null;
}): Promise<ReportQrRow> {
  const qr = await loadQrForTenant(opts.tenantId, opts.qrId);
  if (qr.status === REPORT_QR_STATUS.retired) return qr;
  const prevInstallationId = qr.installationId;
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.opsReportQr.update({
      where: { id: qr.id },
      data: {
        status: REPORT_QR_STATUS.retired,
        installationId: null,
        retiredAt: now,
        retiredBy: opts.actorId,
        retiredReason: opts.reason?.trim() || "Retirado",
      },
      select: QR_SELECT,
    });
    await tx.opsReportQrEvent.create({
      data: {
        tenantId: opts.tenantId,
        qrId: qr.id,
        action: REPORT_QR_EVENT.retire,
        installationId: prevInstallationId,
        actorId: opts.actorId,
        actorKind: "erp",
        note: opts.reason?.trim() || null,
      },
    });
    return row;
  });

  if (prevInstallationId) await syncPrimaryToken(prevInstallationId);

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "UPDATE",
    entity: "OpsReportQr",
    entityId: qr.id,
    details: { action: "retire", serial: qr.serialLabel, token: truncateToken(qr.token) },
  });

  return updated;
}

export async function deleteReportQr(opts: {
  tenantId: string;
  qrId: string;
  actorId: string;
}): Promise<{ id: string; serialLabel: string }> {
  const qr = await loadQrForTenant(opts.tenantId, opts.qrId);
  if (qr.status === REPORT_QR_STATUS.assigned) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      `No se puede eliminar ${qr.serialLabel}: está asignado a una instalación. Libéralo o retíralo primero.`,
      409,
    );
  }

  await prisma.opsReportQr.delete({ where: { id: qr.id } });

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "DELETE",
    entity: "OpsReportQr",
    entityId: qr.id,
    details: { serial: qr.serialLabel, status: qr.status, token: truncateToken(qr.token) },
  });

  return { id: qr.id, serialLabel: qr.serialLabel };
}

export async function deleteReportQrLote(opts: {
  tenantId: string;
  loteId: string;
  actorId: string;
}): Promise<{ loteId: string; code: string; deletedQrs: number }> {
  const lote = await prisma.opsReportQrLote.findFirst({
    where: { id: opts.loteId, tenantId: opts.tenantId },
    select: {
      id: true,
      code: true,
      qrs: { select: { id: true, status: true } },
    },
  });
  if (!lote) throw new IncidenteError("NOT_FOUND", "Lote no encontrado", 404);

  const assignedCount = lote.qrs.filter((q) => q.status === REPORT_QR_STATUS.assigned).length;
  if (assignedCount > 0) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      `No se puede eliminar el lote ${lote.code}: ${assignedCount} QR ${assignedCount === 1 ? "sigue asignado" : "siguen asignados"}. Libéralos o retíralos primero.`,
      409,
      { assignedCount },
    );
  }

  await prisma.opsReportQrLote.delete({ where: { id: lote.id } });

  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "DELETE",
    entity: "OpsReportQrLote",
    entityId: lote.id,
    details: { code: lote.code, deletedQrs: lote.qrs.length },
  });

  return { loteId: lote.id, code: lote.code, deletedQrs: lote.qrs.length };
}

export async function listReportQrLotes(tenantId: string) {
  const lotes = await prisma.opsReportQrLote.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      code: true,
      quantity: true,
      note: true,
      createdBy: true,
      createdAt: true,
      _count: { select: { qrs: true } },
      qrs: {
        select: { status: true },
      },
    },
  });
  return lotes.map((l) => {
    const byStatus = { unassigned: 0, assigned: 0, retired: 0 };
    for (const q of l.qrs) {
      if (q.status === "assigned") byStatus.assigned += 1;
      else if (q.status === "retired") byStatus.retired += 1;
      else byStatus.unassigned += 1;
    }
    return {
      id: l.id,
      code: l.code,
      quantity: l.quantity,
      note: l.note,
      createdBy: l.createdBy,
      createdAt: l.createdAt,
      counts: byStatus,
    };
  });
}

export async function getReportQrLoteForPdf(tenantId: string, loteId: string) {
  const lote = await prisma.opsReportQrLote.findFirst({
    where: { id: loteId, tenantId },
    select: {
      id: true,
      code: true,
      quantity: true,
      qrs: {
        orderBy: { serial: "asc" },
        select: { token: true, serialLabel: true, status: true },
      },
    },
  });
  if (!lote) throw new IncidenteError("NOT_FOUND", "Lote no encontrado", 404);
  return lote;
}

export async function listReportQrs(opts: {
  tenantId: string;
  status?: ReportQrStatus | "all";
  q?: string;
  loteId?: string;
  installationId?: string;
  take?: number;
}) {
  const take = Math.min(opts.take ?? 200, 500);
  const status = opts.status && opts.status !== "all" ? opts.status : undefined;
  const q = opts.q?.trim();
  const rows = await prisma.opsReportQr.findMany({
    where: {
      tenantId: opts.tenantId,
      ...(status ? { status } : {}),
      ...(opts.loteId ? { loteId: opts.loteId } : {}),
      ...(opts.installationId ? { installationId: opts.installationId } : {}),
      ...(q
        ? {
            OR: [
              { serialLabel: { contains: q, mode: "insensitive" } },
              { lote: { code: { contains: q, mode: "insensitive" } } },
              { installation: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ serial: "desc" }],
    take,
    select: {
      id: true,
      serial: true,
      serialLabel: true,
      status: true,
      installationId: true,
      assignedAt: true,
      createdAt: true,
      lote: { select: { id: true, code: true } },
      installation: { select: { id: true, name: true } },
    },
  });
  const [unassigned, assigned, retired] = await Promise.all([
    prisma.opsReportQr.count({ where: { tenantId: opts.tenantId, status: "unassigned" } }),
    prisma.opsReportQr.count({ where: { tenantId: opts.tenantId, status: "assigned" } }),
    prisma.opsReportQr.count({ where: { tenantId: opts.tenantId, status: "retired" } }),
  ]);
  return {
    items: rows,
    counts: { unassigned, assigned, retired, total: unassigned + assigned + retired },
  };
}

export async function getReportQrDetail(tenantId: string, qrId: string) {
  const qr = await loadQrForTenant(tenantId, qrId);
  const events = await prisma.opsReportQrEvent.findMany({
    where: { qrId, tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      action: true,
      installationId: true,
      actorId: true,
      actorKind: true,
      note: true,
      createdAt: true,
    },
  });
  return { qr, events, publicUrl: publicQrUrl(qr.token) };
}

export async function listAssignableInstallations(opts: {
  tenantId: string;
  q?: string;
  lat?: number | null;
  lng?: number | null;
  take?: number;
}) {
  const q = opts.q?.trim();
  const take = Math.min(opts.take ?? 80, 200);
  const rows = await prisma.crmInstallation.findMany({
    where: {
      tenantId: opts.tenantId,
      isActive: true,
      status: "active",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { address: { contains: q, mode: "insensitive" } },
              { commune: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      address: true,
      commune: true,
      city: true,
      lat: true,
      lng: true,
    },
    take,
    orderBy: { name: "asc" },
  });
  const hasGps = opts.lat != null && opts.lng != null && Number.isFinite(opts.lat) && Number.isFinite(opts.lng);
  const mapped = rows.map((r) => {
    const distanceM =
      hasGps && r.lat != null && r.lng != null
        ? Math.round(haversineDistance(opts.lat as number, opts.lng as number, r.lat, r.lng))
        : null;
    return {
      id: r.id,
      name: r.name,
      address: [r.address, r.commune, r.city].filter(Boolean).join(", ") || null,
      hasCoords: r.lat != null && r.lng != null,
      distanceM,
    };
  });
  if (hasGps) mapped.sort((a, b) => (a.distanceM ?? 1e12) - (b.distanceM ?? 1e12));
  return mapped;
}

export function serializeQrListItem(row: {
  id: string;
  serialLabel: string;
  status: string;
  assignedAt: Date | null;
  createdAt: Date;
  lote: { id: string; code: string };
  installation: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    serialLabel: row.serialLabel,
    status: row.status,
    assignedAt: row.assignedAt,
    createdAt: row.createdAt,
    loteId: row.lote.id,
    loteCode: row.lote.code,
    installationId: row.installation?.id ?? null,
    installationName: row.installation?.name ?? null,
  };
}
