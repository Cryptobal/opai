/**
 * Inbound webhook para cartolas bancarias enviadas por email — Resend Inbound.
 *
 * Flujo:
 *   1. El usuario configura en Santander Office Banking → Suscripción Cartola
 *      vía email → ingresa el email único del tenant
 *      (cartola.<KEY>@cartola.opai.cl).
 *   2. Santander envía la cartola Excel automáticamente al inbox.
 *   3. Resend Receiving recibe el mensaje y POSTea acá un evento
 *      `email.received` (firmado con Svix). El payload contiene SOLO
 *      metadata: from/to/subject/email_id + lista de attachments con id,
 *      sin los bytes.
 *   4. Este endpoint:
 *        a) Verifica la firma Svix con resend.webhooks.verify()
 *        b) Resuelve el tenant por la KEY del local-part del To
 *        c) Llama a resend.emails.receiving.attachments.list() para
 *           obtener un download_url firmado por cada adjunto
 *        d) Descarga cada XLSX, lo parsea con el parser de Santander, e
 *           importa los movimientos a la cuenta bancaria del tenant
 *        e) Dispara una notificación 'bank_cartola_received' a los admins
 *
 * Convenciones de respuesta para Resend:
 *   - 200 con { success: true } → procesado OK
 *   - 200 con { skipped: "..." } → no era para nosotros (mail de tickets,
 *     evento que no es email.received, etc.). Devolvemos 200 para evitar
 *     reintentos en bucle.
 *   - 401 → firma Svix inválida (reintentar no ayuda, pero Resend lo hará)
 *   - 5xx → fallo transitorio (DB, fetch del adjunto). Resend reintenta.
 *
 * Env vars requeridas en producción:
 *   - RESEND_API_KEY (necesaria para listar/descargar adjuntos)
 *   - RESEND_INBOUND_WEBHOOK_SECRET (signing secret del webhook en Resend)
 *   - CARTOLA_INBOUND_DOMAIN (default cartola.opai.cl)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import {
  extractInboxKey,
  inboxDomain,
  tenantInboxKey,
} from "@/modules/finance/banking/cartola-inbox";
import { loadXlsxRows } from "@/modules/finance/banking/xlsx-loader";
import { parseSantanderCartola } from "@/modules/finance/banking/santander-parser";
import { importBankTransactions } from "@/modules/finance/banking/bank-transaction.service";
import { notify } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface ReceivedEmailEventData {
  email_id: string;
  created_at?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  message_id?: string;
  subject?: string;
  attachments?: Array<{
    id: string;
    filename?: string;
    content_type?: string;
    content_disposition?: string;
  }>;
}

interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data?: unknown;
}

/**
 * Detecta el banco por el remitente o asunto. Por ahora solo Santander.
 */
function detectBank(from: string, subject: string): "SANTANDER" | null {
  const text = `${from} ${subject}`.toLowerCase();
  if (text.includes("santander")) return "SANTANDER";
  return null;
}

const log = (...args: unknown[]) => console.log("[inbound/cartola]", ...args);

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  // 1. Leer el body crudo (Svix firma sobre el string exacto)
  const rawBody = await request.text();

  // 2. Verificar firma Svix
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  const svixId = request.headers.get("svix-id") ?? "";
  const svixTs = request.headers.get("svix-timestamp") ?? "";
  const svixSig = request.headers.get("svix-signature") ?? "";

  let event: ResendWebhookEvent;
  if (secret) {
    if (!svixId || !svixTs || !svixSig) {
      log("faltan headers svix");
      return NextResponse.json(
        { success: false, error: "Missing Svix headers" },
        { status: 401 },
      );
    }
    try {
      event = resend.webhooks.verify({
        payload: rawBody,
        headers: { id: svixId, timestamp: svixTs, signature: svixSig },
        webhookSecret: secret,
      }) as unknown as ResendWebhookEvent;
    } catch (err) {
      log("svix verify failed:", err);
      return NextResponse.json(
        { success: false, error: "Invalid Svix signature" },
        { status: 401 },
      );
    }
  } else {
    // Dev/test sin secret: parsear directo. En producción siempre debe
    // haber secret.
    log("WARNING: RESEND_INBOUND_WEBHOOK_SECRET no seteado; aceptando sin verificar");
    try {
      event = JSON.parse(rawBody) as ResendWebhookEvent;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }
  }

  // 3. Filtrar solo email.received. Cualquier otro evento es 200 + skipped
  // para que Resend no reintente.
  if (!event || event.type !== "email.received") {
    return NextResponse.json({
      success: true,
      skipped: `event_type:${event?.type ?? "unknown"}`,
    });
  }

  const data = (event.data ?? {}) as ReceivedEmailEventData;
  const emailId = data.email_id;
  const toList = Array.isArray(data.to) ? data.to : [];
  const ccList = Array.isArray(data.cc) ? data.cc : [];
  const bccList = Array.isArray(data.bcc) ? data.bcc : [];
  const recipients = [...toList, ...ccList, ...bccList];
  const fromAddr = typeof data.from === "string" ? data.from : "";
  const subject = data.subject ?? "";

  if (!emailId) {
    return NextResponse.json(
      { success: false, error: "Missing email_id en payload" },
      { status: 400 },
    );
  }

  // 4. Buscar el destinatario que calce con el patrón cartola.KEY@…
  // (un mail puede llevar varios To si lo reenvían). Si ninguno calza, no es
  // un mail de cartola — devolvemos 200 + skipped para que Resend no
  // reintente y los webhooks de tickets/etc. no compitan.
  const expectedDomain = inboxDomain();
  let key: string | null = null;
  for (const r of recipients) {
    const k = extractInboxKey(r, expectedDomain);
    if (k) {
      key = k;
      break;
    }
  }
  if (!key) {
    log("recipient no calza con cartola.KEY@", recipients);
    return NextResponse.json({
      success: true,
      skipped: "not_a_cartola_recipient",
    });
  }

  // 5. Resolver el tenant por la KEY. Hay pocos tenants y este endpoint se
  // dispara 1-2 veces por tenant por día, no es hot path.
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const tenant = tenants.find((t) => tenantInboxKey(t.id) === key);
  if (!tenant) {
    log("tenant no encontrado para key", key);
    // 200 + skipped: la KEY no corresponde a ningún tenant vivo. Reintentar
    // no ayuda.
    return NextResponse.json({
      success: true,
      skipped: "tenant_not_found",
    });
  }
  const tenantId = tenant.id;

  // 6. Detectar banco por remitente/asunto
  const bank = detectBank(fromAddr, subject);
  if (!bank) {
    log(`banco no reconocido (from=${fromAddr}, subject=${subject})`);
    return NextResponse.json({
      success: true,
      skipped: "unknown_bank_sender",
    });
  }

  // 7. Cuenta bancaria objetivo del tenant para ese banco. Si no hay match
  // exacto, fallback a la primera cuenta activa del tenant.
  let accounts = await prisma.financeBankAccount.findMany({
    where: {
      tenantId,
      isActive: true,
      bankCode: { contains: bank, mode: "insensitive" },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    take: 1,
  });
  if (accounts.length === 0) {
    accounts = await prisma.financeBankAccount.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      take: 1,
    });
  }
  const targetAccount = accounts[0];
  if (!targetAccount) {
    log("tenant sin cuenta bancaria activa", tenantId);
    return NextResponse.json({
      success: true,
      skipped: "no_active_bank_account",
    });
  }

  // 8. Listar adjuntos via API de Resend (el webhook trae solo metadata)
  let attachmentMeta;
  try {
    attachmentMeta = await resend.emails.receiving.attachments.list({
      emailId,
    });
  } catch (err) {
    console.error("[inbound/cartola] error listando attachments:", err);
    return NextResponse.json(
      { success: false, error: "Error consultando adjuntos en Resend" },
      { status: 502 },
    );
  }
  if (attachmentMeta.error || !attachmentMeta.data) {
    console.error(
      "[inbound/cartola] respuesta de adjuntos con error:",
      attachmentMeta.error,
    );
    return NextResponse.json(
      { success: false, error: "Resend no devolvió adjuntos" },
      { status: 502 },
    );
  }

  const xlsxList = attachmentMeta.data.data.filter((a) => {
    const name = (a.filename ?? "").toLowerCase();
    const ct = (a.content_type ?? "").toLowerCase();
    return (
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      ct.includes("spreadsheet") ||
      ct.includes("excel")
    );
  });
  if (xlsxList.length === 0) {
    log("no hay adjuntos Excel", attachmentMeta.data.data.length);
    return NextResponse.json({
      success: true,
      skipped: "no_xlsx_attachment",
    });
  }

  // 9. Descargar y procesar cada XLSX
  let totalImported = 0;
  let totalInFile = 0;
  for (const att of xlsxList) {
    if (!att.download_url) {
      log("attachment sin download_url", att.id);
      continue;
    }
    let buf: Buffer;
    try {
      const res = await fetch(att.download_url);
      if (!res.ok) {
        console.error(
          `[inbound/cartola] download_url HTTP ${res.status} para ${att.id}`,
        );
        return NextResponse.json(
          { success: false, error: "Error descargando adjunto desde Resend" },
          { status: 502 },
        );
      }
      const ab = await res.arrayBuffer();
      buf = Buffer.from(ab);
    } catch (err) {
      console.error("[inbound/cartola] fetch download_url error:", err);
      return NextResponse.json(
        { success: false, error: "Error descargando adjunto" },
        { status: 502 },
      );
    }

    const { rows } = await loadXlsxRows(buf);
    if (rows.length === 0) continue;

    const parsed = parseSantanderCartola(rows);
    totalInFile += parsed.transactions.length;
    if (parsed.transactions.length === 0) continue;

    const result = await importBankTransactions(
      tenantId,
      targetAccount.id,
      parsed.transactions,
      parsed.closingBalance,
      // userId=undefined → no corre auto-match. Las reglas se evalúan luego
      // si el usuario corre "Aplicar al histórico" desde Reglas.
      undefined,
      {
        fileName: att.filename ?? `cartola-${att.id}.xlsx`,
        fileSize: buf.byteLength,
        bankFormat: "SANTANDER",
        accountNumberInFile: parsed.accountNumber ?? null,
        periodFrom: parsed.periodFrom ?? null,
        periodTo: parsed.periodTo ?? null,
      },
    );
    totalImported += result.importedCount;
  }

  log(
    `OK tenant=${tenantId} acc=${targetAccount.id} bank=${bank} imported=${totalImported}/${totalInFile} in ${Date.now() - startedAt}ms`,
  );

  // 10. Notificar a los admins. Fire-and-forget: si falla, el import ya
  // fue exitoso y no queremos romper el 200 al provider de inbound (sino
  // reintenta y duplica).
  try {
    const accountLabel = `${targetAccount.bankName} ${targetAccount.accountNumber}`;
    const skipped = totalInFile - totalImported;
    const detail =
      totalImported > 0
        ? `Se importaron ${totalImported} de ${totalInFile} movimientos${
            skipped > 0 ? ` (${skipped} omitidos por duplicados)` : ""
          }.`
        : `Cartola recibida sin movimientos nuevos (${totalInFile} ya estaban importados).`;
    await notify({
      tenantId,
      type: "bank_cartola_received",
      title: `Cartola recibida — ${accountLabel}`,
      body: detail,
      link: "/finanzas/bancos",
      data: {
        bankAccountId: targetAccount.id,
        bank,
        importedCount: totalImported,
        totalInFile,
        emailId,
      },
    });
  } catch (notifyErr) {
    console.error("[inbound/cartola] notify error:", notifyErr);
  }

  return NextResponse.json({
    success: true,
    data: {
      tenantId,
      bankAccountId: targetAccount.id,
      bank,
      importedCount: totalImported,
      totalInFile,
    },
  });
}
