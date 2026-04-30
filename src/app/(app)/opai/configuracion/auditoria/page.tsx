import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { AuditLogsTable, type AuditLogRow } from "@/components/audit/AuditLogsTable";
import { ClipboardCheck } from "lucide-react";

type AuditPageProps = {
  searchParams?: Promise<{
    q?: string;
    action?: string;
    entity?: string;
  }>;
};

export default async function AuditoriaPage({ searchParams }: AuditPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/auditoria");
  }

  const role = session.user.role;
  const isAdmin = role === "owner" || role === "admin";
  if (!isAdmin) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId;
  const params = (await searchParams) ?? {};
  const q = (params.q || "").trim();
  const action = (params.action || "").trim();
  const entity = (params.entity || "").trim();

  const logsRaw = await prisma.auditLog.findMany({
    where: {
      tenantId,
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
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

  // Serializar Date → ISO string para cruzar la frontera Server → Client.
  const logs: AuditLogRow[] = logsRaw.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userEmail: log.userEmail,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    ipAddress: log.ipAddress,
  }));

  const actions = await prisma.auditLog.findMany({
    where: { tenantId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 100,
  });

  const entities = await prisma.auditLog.findMany({
    where: { tenantId },
    distinct: ["entity"],
    select: { entity: true },
    orderBy: { entity: "asc" },
    take: 100,
  });

  return (
    <ConfigPageLayout
      title="Auditoría"
      description="Historial consolidado de acciones de usuarios en tu tenant"
      icon={<ClipboardCheck className="h-[18px] w-[18px]" />}
    >
      <form method="GET" className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por usuario, entidad o ID"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <select
            name="action"
            defaultValue={action}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todas las acciones</option>
            {actions.map((item) => (
              <option key={item.action} value={item.action}>
                {item.action}
              </option>
            ))}
          </select>
          <select
            name="entity"
            defaultValue={entity}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todas las entidades</option>
            {entities.map((item) => (
              <option key={item.entity} value={item.entity}>
                {item.entity}
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

      <AuditLogsTable logs={logs} />
    </ConfigPageLayout>
  );
}
