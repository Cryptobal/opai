import { prisma } from "@/lib/prisma";
import { cleanRut, toSiiRut } from "@/lib/chile-rut";

export type DtEmpleadorListItem = {
  id: string;
  name: string;
  legalName: string;
  rut: string;
};

function employerSortName(t: { legalName: string | null; name: string }): string {
  return (t.legalName || t.name).trim();
}

export async function listDtEmpleadores(query?: string): Promise<DtEmpleadorListItem[]> {
  const tenants = await prisma.tenant.findMany({
    where: { active: true, dtContractEnd: null },
    select: {
      id: true,
      name: true,
      legalName: true,
      companyRut: true,
      modules: { select: { module: true, enabled: true } },
    },
  });

  const withAttendance = tenants.filter((t) => {
    if (t.modules.length === 0) return true;
    const row = t.modules.find((m) => m.module === "ops_asistencia");
    return row ? row.enabled : true;
  });

  const items: DtEmpleadorListItem[] = withAttendance.map((t) => ({
    id: t.id,
    name: t.name,
    legalName: t.legalName || t.name,
    rut: t.companyRut || "",
  }));

  items.sort((a, b) =>
    a.legalName.localeCompare(b.legalName, "es", { sensitivity: "base" }),
  );

  const q = (query ?? "").trim();
  if (!q) return items;
  return items.filter((item) => matchesEmployerQuery(item, q));
}

/** Búsqueda Art. 24 a: nombre o RUT con y sin puntos. */
export function matchesEmployerQuery(
  item: { legalName: string; name: string; rut: string },
  q: string,
): boolean {
  const qLower = q.trim().toLowerCase();
  if (!qLower) return true;
  const qRut = cleanRut(q);
  const qSii = qRut.length >= 8 ? toSiiRut(q) : "";
  if (item.legalName.toLowerCase().includes(qLower)) return true;
  if (item.name.toLowerCase().includes(qLower)) return true;
  if (!item.rut) return false;
  const itemClean = cleanRut(item.rut);
  if (qRut && itemClean.includes(qRut)) return true;
  if (qSii && item.rut.replace(/\./g, "").toLowerCase().includes(qSii.toLowerCase())) return true;
  return false;
}

export async function getDtEmpleador(tenantId: string) {
  return prisma.tenant.findFirst({
    where: { id: tenantId, active: true },
    select: {
      id: true,
      name: true,
      legalName: true,
      companyRut: true,
      dtNoticeEmail: true,
      billingEmail: true,
      supportEmail: true,
    },
  });
}

export async function resolveDtNoticeEmail(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      dtNoticeEmail: true,
      billingEmail: true,
      supportEmail: true,
      admins: {
        where: { status: "active", role: { in: ["owner", "admin"] } },
        select: { email: true, role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!tenant) return null;
  if (tenant.dtNoticeEmail?.trim()) return tenant.dtNoticeEmail.trim();
  const owner = tenant.admins.find((a) => a.role === "owner");
  if (owner?.email) return owner.email;
  if (tenant.admins[0]?.email) return tenant.admins[0].email;
  if (tenant.billingEmail?.trim()) return tenant.billingEmail.trim();
  if (tenant.supportEmail?.trim()) return tenant.supportEmail.trim();
  return null;
}
