/**
 * API: /api/crm/gmail/accounts
 * GET    — lista las casillas Gmail del usuario de sesión. Owner/Admin ven
 *          todas las del tenant, con el email del dueño de cada casilla.
 * DELETE — desconecta una casilla por id: revoca el grant en Google
 *          (best-effort), borra tokens locales y la marca revoked. Solo el
 *          dueño de la casilla u Owner/Admin pueden desconectarla.
 *
 * Pensado para limpiar cuentas huérfanas o de ex-integrantes cuyo token quedó
 * muerto. No borra los hilos ya sincronizados: solo corta la conexión viva.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { isAdminRole } from "@/lib/access";
import { decryptText, getGmailTokenSecret } from "@/lib/crypto";
import { requireTenantModule } from "@/lib/require-module";
import { revokeGoogleToken } from "@/modules/crm/email/gmail-revoke";
import { stopGmailWatch } from "@/modules/crm/email/gmail-watch";
import { auditEmailAction } from "@/lib/audit-email";
import { captureEmailError } from "@/modules/crm/email/email-observability";

export const dynamic = "force-dynamic";
// El DELETE hace hasta dos llamadas a Google (users.stop + revoke), ambas con
// timeout propio; margen para que la desconexión local siempre alcance a correr.
export const maxDuration = 30;

/** Espera acotada para detener el watch: si Google se cuelga, seguimos con la
 * revocación igual (el stop queda corriendo en background, como antes). */
const STOP_WATCH_TIMEOUT_MS = 8_000;

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx);
  if (forbidden) return forbidden;

  // C08: `?aliases=1` — anota cada casilla PROPIA activa con sus aliases
  // sendAs (cacheados con TTL) para el selector de identidad del composer.
  const withAliases = request.nextUrl.searchParams.get("aliases") === "1";

  const elevated = isAdminRole(ctx.userRole);
  const accounts = await prisma.crmEmailAccount.findMany({
    where: {
      tenantId: ctx.tenantId,
      provider: "gmail",
      // Usuarios sin rol elevado solo ven sus propias casillas.
      ...(elevated ? {} : { userId: ctx.userId }),
    },
    select: {
      id: true,
      email: true,
      status: true,
      userId: true,
      updatedAt: true,
      ...(withAliases
        ? { sendAs: true, accessTokenEncrypted: true, refreshTokenEncrypted: true }
        : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  if (withAliases) {
    const { getSendAsAliases } = await import(
      "@/modules/crm/email/gmail-sendas"
    );
    const enriched = await Promise.all(
      accounts.map(async (account) => {
        const aliases =
          account.userId === ctx.userId && account.status === "active"
            ? await getSendAsAliases(
                account as typeof account & {
                  sendAs: unknown;
                  accessTokenEncrypted: string | null;
                  refreshTokenEncrypted: string | null;
                },
              )
            : [];
        return {
          id: account.id,
          email: account.email,
          status: account.status,
          userId: account.userId,
          updatedAt: account.updatedAt,
          aliases,
        };
      }),
    );
    return NextResponse.json({ accounts: enriched });
  }

  if (!elevated) {
    return NextResponse.json({ accounts });
  }

  // Owner/Admin: anotar cada casilla con el email del dueño (sin relación FK
  // en el schema, se resuelve con una segunda query).
  const ownerIds = [...new Set(accounts.map((a) => a.userId))];
  const owners = await prisma.admin.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, email: true },
  });
  const ownerEmailById = new Map(owners.map((o) => [o.id, o.email]));
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      ...a,
      ownerEmail: ownerEmailById.get(a.userId) ?? null,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  // Vista CRM basta: desconectar la casilla propia no debe exigir más permiso
  // que el que se pidió para conectarla; el cruce de usuario se controla abajo.
  const forbidden = await requireCrmView(ctx);
  if (forbidden) return forbidden;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // El registro debe pertenecer al tenant del solicitante (aislamiento).
  const acc = await prisma.crmEmailAccount.findFirst({
    where: { id, tenantId: ctx.tenantId, provider: "gmail" },
    select: {
      id: true,
      email: true,
      userId: true,
      syncState: true,
      accessTokenEncrypted: true,
      refreshTokenEncrypted: true,
    },
  });
  if (!acc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Solo el dueño de la casilla u Owner/Admin pueden desconectarla.
  if (acc.userId !== ctx.userId && !isAdminRole(ctx.userRole)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Detener el watch antes de revocar: `users.stop` necesita el grant vivo.
  // Espera acotada: un cuelgue de Google no debe impedir la desconexión local.
  await Promise.race([
    stopGmailWatch(acc).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, STOP_WATCH_TIMEOUT_MS)),
  ]);

  // Revocar el grant en Google. Best-effort: si falla (red, token ya
  // inválido, secreto ausente) se registra y la desconexión local continúa.
  let upstreamRevoked = false;
  try {
    const secret = getGmailTokenSecret();
    const token = acc.refreshTokenEncrypted
      ? decryptText(acc.refreshTokenEncrypted, secret)
      : acc.accessTokenEncrypted
        ? decryptText(acc.accessTokenEncrypted, secret)
        : null;
    if (token) upstreamRevoked = await revokeGoogleToken(token);
  } catch (error) {
    captureEmailError(error, {
      scope: "revocacion-upstream",
      tenantId: ctx.tenantId,
      emailAccountId: acc.id,
    });
  }

  await prisma.crmEmailAccount.update({
    where: { id: acc.id },
    data: {
      status: "revoked",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
    },
  });

  void auditEmailAction({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    action: "disconnect_account",
    entityType: "email_account",
    entityId: acc.id,
    meta: { mailbox: acc.email, ownerUserId: acc.userId, upstreamRevoked },
  });

  return NextResponse.json({ ok: true, email: acc.email, upstreamRevoked });
}
