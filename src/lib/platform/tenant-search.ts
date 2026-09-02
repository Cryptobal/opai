import { rutSearchNeedles } from "@/lib/chile-rut";
import type { Prisma } from "@prisma/client";

export function tenantSearchWhere(q: string): Prisma.TenantWhereInput {
  const trimmed = q.trim();
  if (!trimmed) return {};
  const needles = rutSearchNeedles(trimmed);
  const or: Prisma.TenantWhereInput[] = [
    { name: { contains: trimmed, mode: "insensitive" } },
    { slug: { contains: trimmed, mode: "insensitive" } },
    { legalName: { contains: trimmed, mode: "insensitive" } },
  ];
  for (const n of needles) {
    or.push({ companyRut: { contains: n, mode: "insensitive" } });
  }
  return { OR: or };
}
