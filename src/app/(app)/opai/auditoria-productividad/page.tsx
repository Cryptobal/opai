import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { AuditLogsTable, type AuditLogRow } from "@/components/audit/AuditLogsTable";
import { AuditoriaProductividadToolbar } from "@/components/audit/AuditoriaProductividadToolbar";
import { PRODUCTIVIDAD_AUDIT_PREFIXES } from "@/lib/audit-productividad";

export const metadata = { title: "Auditoría · Productividad" };

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    action?: string;
    domain?: string;
  }>;
};

function detailLabel(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  for (const key of ["title", "subject"] as const) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof d.mode === "string" && d.mode.trim()) return `Modo: ${d.mode.trim()}`;
  if (typeof d.threadId === "string" && d.threadId.trim()) {
    return `Hilo ${d.threadId.trim().slice(0, 8)}…`;
  }
  if (typeof d.snoozeUntil === "string" && d.snoozeUntil.trim()) {
    return `Hasta ${new Date(d.snoozeUntil).toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return null;
}

export default async function AuditoriaProductividadPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/auditoria-productividad");
  }

  const role = session.user.role ?? "";
  const isAdmin = role === "owner" || role === "admin";
  if (!isAdmin) {
    redirect("/opai/agenda");
  }

  const perms = await resolvePagePerms(session.user);
  const canAudit =
    canView(perms, "productividad", "tareas") ||
    canView(perms, "productividad", "agenda") ||
    canView(perms, "productividad", "correos");
  if (!canAudit) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const params = (await searchParams) ?? {};
  const q = (params.q || "").trim();
  const action = (params.action || "").trim();
  const domain = (params.domain || "").trim();

  const prefixFilter =
    domain === "task"
      ? [{ action: { startsWith: "task." } }]
      : domain === "agenda"
        ? [{ action: { startsWith: "agenda." } }]
        : domain === "email"
          ? [{ action: { startsWith: "email." } }]
          : PRODUCTIVIDAD_AUDIT_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } }));

  const logsRaw = await prisma.auditLog.findMany({
    where: {
      tenantId,
      AND: [{ OR: prefixFilter }, ...(action ? [{ action }] : [])],
      ...(q
        ? {
            OR: [
              { userEmail: { contains: q, mode: "insensitive" } },
              { action: { contains: q, mode: "insensitive" } },
              { entity: { contains: q, mode: "insensitive" } },
              { entityId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const logs: AuditLogRow[] = logsRaw.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userEmail: log.userEmail,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    ipAddress: log.ipAddress,
    detail: detailLabel(log.details),
  }));

  const actions = await prisma.auditLog.findMany({
    where: {
      tenantId,
      OR: PRODUCTIVIDAD_AUDIT_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })),
    },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 80,
  });

  return (
    <div className="space-y-4 min-w-0">
      <AuditoriaProductividadToolbar
        q={q}
        action={action}
        domain={domain}
        actions={actions.map((item) => item.action)}
      />

      <AuditLogsTable logs={logs} />
    </div>
  );
}
