/**
 * API: /api/crm/gmail/accounts
 * GET    — lista todas las cuentas Gmail del tenant (para administrarlas).
 * DELETE — desconecta una cuenta por id (borra tokens y la marca revoked).
 *
 * Pensado para limpiar cuentas huérfanas o de ex-integrantes cuyo token quedó
 * muerto. No borra los hilos ya sincronizados: solo corta la conexión viva.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";

export const dynamic = "force-dynamic";

export async function GET() {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "no_tenant" }, { status: 401 });

  const accounts = await prisma.crmEmailAccount.findMany({
    where: { tenantId, provider: "gmail" },
    select: { id: true, email: true, status: true, userId: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ accounts });
}

export async function DELETE(request: NextRequest) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "no_tenant" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // El registro debe pertenecer al tenant del solicitante (aislamiento).
  const acc = await prisma.crmEmailAccount.findFirst({
    where: { id, tenantId, provider: "gmail" },
    select: { id: true, email: true },
  });
  if (!acc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.crmEmailAccount.update({
    where: { id: acc.id },
    data: {
      status: "revoked",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
    },
  });

  return NextResponse.json({ ok: true, email: acc.email });
}
