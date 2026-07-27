/**
 * GET /api/crm/conversaciones?accountId=… | ?dealId=… | ?installationId=…
 *
 * Lista los hilos de correo VISIBLES en la ficha de una entidad (Bloque 5,
 * "asociar = compartir"). El acceso se deriva de la entidad (no del dueño de la
 * casilla): se filtra por tenant + entidad + flag de visibilidad. Nunca expone
 * hilos privados ni de otros tenants. El detalle se abre con el lector embebido
 * (GET /api/crm/conversaciones/[threadId]); ya NO se enlaza al módulo Correos.
 *
 *  - Cuenta/Negocio: hilos con accountId|dealId = X y sharedWithAccount = true.
 *  - Instalación (u otra entidad vinculada): hilos con un CrmEmailThreadLink
 *    {entityType, entityId} y visibleOnEntity = true.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canView, canViewInstallations } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ThreadRow = {
  id: string;
  subject: string;
  lastMessageAt: Date | null;
  messages: { fromEmail: string | null }[];
};

function toDTO(rows: ThreadRow[]) {
  return rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    fromEmail: t.messages[0]?.fromEmail ?? null,
    lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
  }));
}

const THREAD_SELECT = {
  id: true,
  subject: true,
  lastMessageAt: true,
  messages: { orderBy: { sentAt: "desc" as const }, take: 1, select: { fromEmail: true } },
};

export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenantId = ctx.tenantId;
  const perms = await resolveApiPerms(ctx);

  const accountId = req.nextUrl.searchParams.get("accountId");
  const dealId = req.nextUrl.searchParams.get("dealId");
  const installationId = req.nextUrl.searchParams.get("installationId");

  if (accountId) {
    // Acceso derivado de la cuenta (módulo CRM · cuentas).
    if (!canView(perms, "crm", "accounts")) {
      return NextResponse.json({ error: "Sin acceso a la cuenta" }, { status: 403 });
    }
    const account = await prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId },
      select: { id: true },
    });
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

    const threads = await prisma.crmEmailThread.findMany({
      where: { tenantId, accountId, sharedWithAccount: true },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      select: THREAD_SELECT,
    });
    return NextResponse.json({ threads: toDTO(threads) });
  }

  if (dealId) {
    // Acceso derivado del negocio (módulo CRM · negocios).
    if (!canView(perms, "crm", "deals")) {
      return NextResponse.json({ error: "Sin acceso al negocio" }, { status: 403 });
    }
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true },
    });
    if (!deal) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });

    const threads = await prisma.crmEmailThread.findMany({
      where: { tenantId, dealId, sharedWithAccount: true },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      select: THREAD_SELECT,
    });
    return NextResponse.json({ threads: toDTO(threads) });
  }

  if (installationId) {
    // Acceso derivado de la instalación (CRM/Ops · instalaciones).
    if (!canViewInstallations(perms)) {
      return NextResponse.json({ error: "Sin acceso a la instalación" }, { status: 403 });
    }
    const links = await prisma.crmEmailThreadLink.findMany({
      where: { tenantId, entityType: "installation", entityId: installationId, visibleOnEntity: true },
      select: { threadId: true },
    });
    const threadIds = links.map((l) => l.threadId);
    if (threadIds.length === 0) return NextResponse.json({ threads: [] });

    const threads = await prisma.crmEmailThread.findMany({
      where: { tenantId, id: { in: threadIds } },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      select: THREAD_SELECT,
    });
    return NextResponse.json({ threads: toDTO(threads) });
  }

  return NextResponse.json({ error: "Falta accountId, dealId o installationId" }, { status: 400 });
}
