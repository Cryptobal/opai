/**
 * GET /api/crm/conversaciones/[threadId]?entityType=&entityId=
 *
 * Detalle de un hilo compartido, autorizado por la ENTIDAD (cuenta/negocio/
 * instalación), no por la casilla Gmail. Servido 100% desde el espejo local:
 * esta ruta NUNCA instancia un cliente Gmail. Cualquier usuario del tenant con
 * `view` sobre la entidad y con el hilo asociado+visible lee la conversación
 * completa, tenga o no Gmail conectado.
 *
 * `entityType`/`entityId` del cliente son entrada NO confiable: se cruzan
 * contra la asociación real del hilo (accountId/dealId + sharedWithAccount, o
 * CrmEmailThreadLink + visibleOnEntity) antes de devolver nada.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canView, canViewInstallations } from "@/lib/permissions";
import { getEntityThreadDetail } from "@/modules/crm/email/entity-thread";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ threadId: string }> };
const ENTITY_TYPES = ["account", "deal", "installation"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth();
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenantId = auth.tenantId;
  const perms = await resolveApiPerms(auth);

  const { threadId } = await ctx.params;
  const entityType = req.nextUrl.searchParams.get("entityType") as EntityType | null;
  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityType || !ENTITY_TYPES.includes(entityType) || !entityId) {
    return NextResponse.json({ error: "entityType/entityId requeridos" }, { status: 400 });
  }

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: { id: true, subject: true, accountId: true, dealId: true, sharedWithAccount: true, attachmentsMeta: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  // Autorización: permiso de módulo sobre la entidad + hilo realmente asociado
  // y visible en esa entidad. Se niega con 403 si no cumple ambas.
  let allowed = false;
  if (entityType === "account") {
    allowed = canView(perms, "crm", "accounts") && thread.accountId === entityId && thread.sharedWithAccount;
  } else if (entityType === "deal") {
    allowed = canView(perms, "crm", "deals") && thread.dealId === entityId && thread.sharedWithAccount;
  } else {
    if (canViewInstallations(perms)) {
      const link = await prisma.crmEmailThreadLink.findFirst({
        where: { tenantId, threadId, entityType: "installation", entityId, visibleOnEntity: true },
        select: { id: true },
      });
      allowed = Boolean(link);
    }
  }
  if (!allowed) return NextResponse.json({ error: "Sin acceso a esta conversación" }, { status: 403 });

  const detail = await getEntityThreadDetail({
    tenantId,
    threadId: thread.id,
    subject: thread.subject,
    attachmentsMeta: thread.attachmentsMeta,
  });
  return NextResponse.json(detail);
}
