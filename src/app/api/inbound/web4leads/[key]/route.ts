/**
 * Inbound webhook para movimientos bancarios desde Web4Leads.
 *
 * POST /api/inbound/web4leads/<KEY>
 *
 * Flujo:
 *   1. Resuelve tenant por la KEY del URL.
 *   2. Deriva el secret del tenant y verifica HMAC + ventana de timestamp.
 *   3. Match a la cuenta bancaria del tenant por número de cuenta
 *      (bankCode solo desempata si hay varias con el mismo número).
 *   4. Inserta en finance_bank_transactions con
 *      apiTransactionId = "web4leads:<externalId>" → idempotente.
 *   5. Actualiza saldo + apiLastSync de la cuenta.
 *   6. Notifica a admins (movimientos importados, o cuenta no reconocida).
 *
 * NO corre auto-match (consistente con /api/inbound/cartola): los movimientos
 * entran UNMATCHED y el usuario los concilia desde Bancos → Reglas.
 *
 * Env: WEB4LEADS_MASTER_SECRET (del que se derivan los secrets per-tenant).
 *
 * Respuestas (convención para que el provider no reintente en bucle):
 *   200 { success, imported, duplicates } → OK
 *   200 { success, skipped }              → no aplicaba; no reintentar
 *   401                                   → firma/timestamp inválido; no reintentar
 *   400                                   → payload mal formado; no reintentar
 *   5xx                                   → error transitorio; reintentar
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  tenantWeb4leadsKey,
  tenantWeb4leadsSecret,
  verifyWeb4leadsSignature,
  isWeb4leadsTimestampValid,
  normalizeAccountNumber,
  normalizeBankCode,
} from "@/modules/finance/banking/web4leads-inbox";
import { notify } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface MovementInput {
  externalId: string;
  transactionDate: string; // YYYY-MM-DD
  description: string;
  reference?: string | null;
  amount: number; // + abono / - cargo
  balance?: number | null;
}

interface Web4leadsPayload {
  accountNumber: string;
  bankCode?: string; // opcional, solo desempate
  movements: MovementInput[];
}

const log = (...args: unknown[]) => console.log("[inbound/web4leads]", ...args);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const startedAt = Date.now();
  const { key } = await params;

  const rawBody = await request.text();

  // 1. Headers de firma
  const timestamp = request.headers.get("x-web4leads-timestamp") ?? "";
  const signature = request.headers.get("x-web4leads-signature") ?? "";
  if (!timestamp || !signature) {
    return NextResponse.json(
      { success: false, error: "Missing signature headers" },
      { status: 401 },
    );
  }
  if (!isWeb4leadsTimestampValid(timestamp)) {
    return NextResponse.json(
      { success: false, error: "Timestamp out of window" },
      { status: 401 },
    );
  }

  // 2. Resolver tenant por KEY (el secret es per-tenant: necesitamos el tenant
  //    para derivarlo y verificar la firma).
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const tenant = tenants.find((t) => tenantWeb4leadsKey(t.id) === key);
  if (!tenant) {
    log("tenant no encontrado para key", key);
    return NextResponse.json(
      { success: true, skipped: "tenant_not_found" },
      { status: 200 },
    );
  }
  const tenantId = tenant.id;

  // 3. Derivar secret del tenant y verificar firma
  const secret = tenantWeb4leadsSecret(tenantId);
  if (!secret) {
    console.error("[inbound/web4leads] WEB4LEADS_MASTER_SECRET no configurado");
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }
  if (!verifyWeb4leadsSignature(rawBody, timestamp, signature, secret)) {
    log("firma inválida tenant", tenantId);
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 401 },
    );
  }

  // 4. Parse + validación
  let payload: Web4leadsPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }
  if (!payload.accountNumber || !Array.isArray(payload.movements)) {
    return NextResponse.json(
      { success: false, error: "Missing accountNumber or movements" },
      { status: 400 },
    );
  }
  if (payload.movements.length === 0) {
    return NextResponse.json({ success: true, imported: 0, duplicates: 0 });
  }
  if (payload.movements.length > 500) {
    return NextResponse.json(
      { success: false, error: "Batch demasiado grande (máx 500)" },
      { status: 400 },
    );
  }
  for (const [i, m] of payload.movements.entries()) {
    if (!m.externalId || typeof m.externalId !== "string") {
      return NextResponse.json(
        { success: false, error: `movements[${i}].externalId requerido` },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.transactionDate)) {
      return NextResponse.json(
        {
          success: false,
          error: `movements[${i}].transactionDate debe ser YYYY-MM-DD`,
        },
        { status: 400 },
      );
    }
    if (typeof m.amount !== "number" || !Number.isFinite(m.amount)) {
      return NextResponse.json(
        { success: false, error: `movements[${i}].amount debe ser número` },
        { status: 400 },
      );
    }
    if (!m.description || typeof m.description !== "string") {
      return NextResponse.json(
        { success: false, error: `movements[${i}].description requerido` },
        { status: 400 },
      );
    }
  }

  // 5. Match de cuenta: PRIMARIO por número (bankCode es texto libre, poco
  //    confiable). Si hay varias con el mismo número, desempata por bankCode.
  const wantedAccount = normalizeAccountNumber(payload.accountNumber);
  const wantedBank = payload.bankCode
    ? normalizeBankCode(payload.bankCode)
    : null;

  const activeAccounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  let matches = activeAccounts.filter(
    (a) => normalizeAccountNumber(a.accountNumber) === wantedAccount,
  );
  if (matches.length > 1 && wantedBank) {
    const byBank = matches.filter(
      (a) => normalizeBankCode(a.bankCode) === wantedBank,
    );
    if (byBank.length > 0) matches = byBank;
  }
  const account = matches[0];

  // 5b. Cuenta no encontrada → NO perder data: notificar al admin.
  if (!account) {
    log(`cuenta no encontrada tenant=${tenantId} acc=${wantedAccount}`);
    try {
      await notify({
        tenantId,
        type: "bank_cartola_received",
        title: "Movimientos para una cuenta no registrada",
        body: `Web4Leads envió ${payload.movements.length} movimiento(s) para la cuenta ${payload.accountNumber}${payload.bankCode ? ` (${payload.bankCode})` : ""}, que no existe en el sistema. Crea la cuenta en Finanzas → Bancos para empezar a recibirlos.`,
        link: "/finanzas/bancos?tab=accounts",
        data: {
          provider: "WEB4LEADS",
          accountNumber: payload.accountNumber,
          bankCode: payload.bankCode ?? null,
        },
      });
    } catch (err) {
      console.error(
        "[inbound/web4leads] notify (cuenta no encontrada) error:",
        err,
      );
    }
    return NextResponse.json(
      { success: true, skipped: "bank_account_not_found" },
      { status: 200 },
    );
  }

  // 6. Insert idempotente
  const data = payload.movements.map((m) => ({
    tenantId,
    bankAccountId: account.id,
    transactionDate: new Date(m.transactionDate),
    description: m.description,
    reference: m.reference ?? null,
    amount: new Prisma.Decimal(m.amount),
    balance:
      m.balance != null && Number.isFinite(m.balance)
        ? new Prisma.Decimal(m.balance)
        : null,
    source: "API" as const,
    reconciliationStatus: "UNMATCHED" as const,
    apiTransactionId: `web4leads:${m.externalId}`,
  }));

  const result = await prisma.financeBankTransaction.createMany({
    data,
    skipDuplicates: true,
  });
  const imported = result.count;
  const duplicates = payload.movements.length - imported;

  // 7. Saldo + apiLastSync. El balance más reciente es el del movimiento de
  //    fecha más alta (ordenamos, no confiamos en el orden de llegada).
  const lastWithBalance = [...payload.movements]
    .filter((m) => typeof m.balance === "number" && Number.isFinite(m.balance))
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
    .pop();

  if (imported > 0) {
    await prisma.financeBankAccount.update({
      where: { id: account.id },
      data: {
        apiLastSync: new Date(),
        apiProvider: "WEB4LEADS",
        ...(lastWithBalance?.balance != null
          ? {
              currentBalance: new Prisma.Decimal(lastWithBalance.balance),
              balanceUpdatedAt: new Date(),
            }
          : {}),
      },
    });
  }

  // 8. Notificación (fire-and-forget; un fallo no debe romper el 200)
  if (imported > 0) {
    try {
      await notify({
        tenantId,
        type: "bank_cartola_received",
        title: `Movimientos bancarios recibidos — ${account.bankName}`,
        body: `Se recibieron ${imported} movimiento(s) desde Web4Leads en ${account.accountNumber}.${duplicates > 0 ? ` (${duplicates} duplicados ignorados)` : ""}`,
        link: "/finanzas/bancos?tab=transactions",
        data: {
          bankAccountId: account.id,
          provider: "WEB4LEADS",
          imported,
          duplicates,
        },
      });
    } catch (err) {
      console.error("[inbound/web4leads] notify error:", err);
    }
  }

  log(
    `OK tenant=${tenantId} acc=${account.id} imported=${imported}/${payload.movements.length} in ${Date.now() - startedAt}ms`,
  );
  return NextResponse.json({ success: true, imported, duplicates });
}
