/**
 * GET /api/crm/tasks/crm-links
 * Typeahead liviano para vinculación CRM de tareas (cuenta → negocio →
 * cotización / instalación). Auth: requireTasksAccess("view") para que roles
 * con productividad.tareas (sin crm.deals/cpq) puedan vincular.
 *
 * Params:
 *   type=accounts|deals|quotes|installations
 *   q=<término> (mín. 0 si hay padre; 2 para accounts sin filtro)
 *   id=<uuid> — resolución puntual del seleccionado
 *   accountId / dealId — filtros de cascada
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTasksAccess } from "@/lib/api-auth-tareas";

const TYPES = ["accounts", "deals", "quotes", "installations"] as const;
type LinkType = (typeof TYPES)[number];

export async function GET(request: NextRequest) {
  try {
    const access = await requireTasksAccess("view");
    if (!access.authorized) return access.response;
    const { tenantId } = access.ctx;

    const sp = request.nextUrl.searchParams;
    const type = sp.get("type") as LinkType | null;
    if (!type || !TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: "type inválido" }, { status: 400 });
    }

    const id = sp.get("id");
    const q = (sp.get("q") || "").trim();
    const accountId = sp.get("accountId") || undefined;
    const dealId = sp.get("dealId") || undefined;

    if (id) {
      const item = await resolveById(tenantId, type, id);
      return NextResponse.json({ success: true, items: item ? [item] : [] });
    }

    const items = await search(tenantId, type, q, accountId, dealId);
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("[TAREAS] crm-links:", error);
    return NextResponse.json({ success: false, error: "Error al buscar vinculación CRM" }, { status: 500 });
  }
}

async function resolveById(tenantId: string, type: LinkType, id: string) {
  if (type === "accounts") {
    const a = await prisma.crmAccount.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, rut: true },
    });
    return a ? { id: a.id, label: a.name, sub: a.rut } : null;
  }
  if (type === "deals") {
    const d = await prisma.crmDeal.findFirst({
      where: { id, tenantId },
      select: { id: true, title: true, accountId: true },
    });
    return d ? { id: d.id, label: d.title, accountId: d.accountId } : null;
  }
  if (type === "quotes") {
    const q = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      select: { id: true, code: true, name: true, accountId: true, dealId: true, installationId: true },
    });
    if (!q) return null;
    return {
      id: q.id,
      label: q.name?.trim() ? `${q.code} · ${q.name}` : q.code,
      accountId: q.accountId,
      dealId: q.dealId,
      installationId: q.installationId,
    };
  }
  const i = await prisma.crmInstallation.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, accountId: true, city: true },
  });
  return i
    ? { id: i.id, label: i.name, sub: i.city, accountId: i.accountId }
    : null;
}

async function search(
  tenantId: string,
  type: LinkType,
  q: string,
  accountId?: string,
  dealId?: string,
) {
  if (type === "accounts") {
    if (q.length < 2) return [];
    const rows = await prisma.crmAccount.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { rut: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, rut: true },
      orderBy: { name: "asc" },
      take: 10,
    });
    return rows.map((a) => ({ id: a.id, label: a.name, sub: a.rut }));
  }

  if (type === "deals") {
    if (!accountId) return [];
    const rows = await prisma.crmDeal.findMany({
      where: {
        tenantId,
        accountId,
        ...(q.length >= 1
          ? { title: { contains: q, mode: "insensitive" as const } }
          : {}),
      },
      select: { id: true, title: true, accountId: true },
      orderBy: { updatedAt: "desc" },
      take: 15,
    });
    return rows.map((d) => ({ id: d.id, label: d.title, accountId: d.accountId }));
  }

  if (type === "quotes") {
    if (!accountId && !dealId) return [];
    const rows = await prisma.cpqQuote.findMany({
      where: {
        tenantId,
        ...(dealId ? { dealId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(q.length >= 1
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: { id: true, code: true, name: true, accountId: true, dealId: true, installationId: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.name?.trim() ? `${r.code} · ${r.name}` : r.code,
      accountId: r.accountId,
      dealId: r.dealId,
      installationId: r.installationId,
    }));
  }

  if (!accountId) return [];
  const rows = await prisma.crmInstallation.findMany({
    where: {
      tenantId,
      accountId,
      ...(q.length >= 1
        ? { name: { contains: q, mode: "insensitive" as const } }
        : {}),
    },
    select: { id: true, name: true, accountId: true, city: true },
    orderBy: { name: "asc" },
    take: 15,
  });
  return rows.map((i) => ({
    id: i.id,
    label: i.name,
    sub: i.city,
    accountId: i.accountId,
  }));
}
