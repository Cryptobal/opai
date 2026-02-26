import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { ConfigBackLink, PageHeader } from "@/components/opai";

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

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const params = (await searchParams) ?? {};
  const q = (params.q || "").trim();
  const action = (params.action || "").trim();
  const entity = (params.entity || "").trim();

  const logs = await prisma.auditLog.findMany({
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
    <>
      <ConfigBackLink />
      <PageHeader
        title="Auditoría"
        description="Historial consolidado de acciones de usuarios en tu tenant"
      />

      <div className="space-y-6">
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

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Usuario</th>
                  <th className="px-3 py-2 text-left">Acción</th>
                  <th className="px-3 py-2 text-left">Entidad</th>
                  <th className="px-3 py-2 text-left">ID ficha</th>
                  <th className="px-3 py-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-border/70">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("es-CL")}
                    </td>
                    <td className="px-3 py-2">{log.userEmail || "—"}</td>
                    <td className="px-3 py-2">{log.action}</td>
                    <td className="px-3 py-2">{log.entity}</td>
                    <td className="px-3 py-2">{log.entityId || "—"}</td>
                    <td className="px-3 py-2">{log.ipAddress || "—"}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      No hay registros de auditoría para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
