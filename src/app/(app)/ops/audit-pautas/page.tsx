import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { ShieldCheck } from "lucide-react";
import {
  PautasAuditTable,
  formatAction,
  type PautasAuditLogRow,
} from "@/components/audit/PautasAuditTable";

type AuditPautasPageProps = {
  searchParams?: Promise<{
    q?: string;
    action?: string;
  }>;
};

/** OPS actions that appear in this audit view */
const OPS_ACTION_PREFIX = ["ops.pauta.", "ops.refuerzo.", "ops.refuerzos."];

export default async function AuditPautasPage({ searchParams }: AuditPautasPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/audit-pautas");
  }

  const perms = await resolvePagePerms(session.user);
  // Any user with access to at least one pauta submodule can see the audit
  const hasAnyPauta =
    canView(perms, "ops", "pauta_mensual") ||
    canView(perms, "ops", "pauta_diaria") ||
    canView(perms, "ops", "turnos_extra") ||
    canView(perms, "ops", "ppc");
  if (!hasAnyPauta) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const params = (await searchParams) ?? {};
  const q = (params.q || "").trim();
  const actionFilter = (params.action || "").trim();

  const logsRaw = await prisma.auditLog.findMany({
    where: {
      tenantId,
      AND: [
        // Only ops.pauta.* / ops.refuerzo.* actions
        {
          OR: OPS_ACTION_PREFIX.map((prefix) => ({
            action: { startsWith: prefix },
          })),
        },
        ...(actionFilter ? [{ action: actionFilter }] : []),
        ...(q
          ? [
              {
                OR: [
                  { userEmail: { contains: q, mode: "insensitive" as const } },
                  { entityId: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      userEmail: true,
      action: true,
      entity: true,
      entityId: true,
      details: true,
    },
  });

  // Serializar Date → ISO string para cruzar la frontera Server → Client.
  const logs: PautasAuditLogRow[] = logsRaw.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userEmail: log.userEmail,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    details: log.details,
  }));

  // Distinct actions for the filter dropdown (only ops.pauta.* and ops.refuerzo.*)
  const actions = await prisma.auditLog.findMany({
    where: {
      tenantId,
      OR: OPS_ACTION_PREFIX.map((prefix) => ({
        action: { startsWith: prefix },
      })),
    },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 50,
  });

  return (
    <div className="space-y-6 min-w-0">
      <ModuleSubNav moduleKey="ops-pautas" />
      <PageHero
        icon={<ShieldCheck />}
        iconTone="emerald"
        title="Auditoría de Pautas"
        subtitle="control y trazabilidad"
        description="Historial de acciones en pauta mensual, refuerzos y exportaciones"
      />

      {/* Filters */}
      <form method="GET" className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por usuario o instalación…"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <select
            name="action"
            defaultValue={actionFilter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todas las acciones</option>
            {actions.map((item) => (
              <option key={item.action} value={item.action}>
                {formatAction(item.action)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Filtrar
          </button>
        </div>
      </form>

      <PautasAuditTable logs={logs} />
    </div>
  );
}
