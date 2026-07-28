import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { AuditLogsTable, type AuditLogRow } from "@/components/audit/AuditLogsTable";
import { Surface } from "@/components/opai-ds";
import { PRODUCTIVIDAD_AUDIT_PREFIXES } from "@/lib/audit-productividad";

export const metadata = { title: "Auditoría · Productividad" };

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    action?: string;
    domain?: string;
  }>;
};

const DOMAIN_OPTIONS = [
  { value: "", label: "Tareas y agenda" },
  { value: "task", label: "Solo tareas" },
  { value: "agenda", label: "Solo agenda" },
];

function detailLabel(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const title = (details as Record<string, unknown>).title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
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
  if (!canView(perms, "productividad", "tareas") && !canView(perms, "productividad", "agenda")) {
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
    take: 50,
  });

  return (
    <div className="space-y-4 min-w-0">
      <header className="min-w-0">
        <h1 className="font-display text-lg font-semibold tracking-tight text-ds-text-1 sm:text-xl">
          Auditoría de Productividad
        </h1>
        <p className="mt-0.5 text-[13px] text-ds-text-3">
          Historial de creación, cambios y eliminaciones de tareas y agenda.
        </p>
      </header>

      <Surface elevation={1} padding="md">
        <form method="GET" className="grid gap-3 md:grid-cols-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por usuario, acción o ID"
            className="h-10 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
          />
          <select
            name="domain"
            defaultValue={domain}
            className="h-10 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
          >
            {DOMAIN_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            name="action"
            defaultValue={action}
            className="h-10 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
          >
            <option value="">Todas las acciones</option>
            {actions.map((item) => (
              <option key={item.action} value={item.action}>
                {item.action}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground sm:h-9"
          >
            Filtrar
          </button>
        </form>
      </Surface>

      <AuditLogsTable logs={logs} />
    </div>
  );
}
