/**
 * Inbound webhook para cartolas bancarias enviadas por email.
 *
 * Flujo:
 *   1. El usuario configura en Santander Office Banking → Suscripción
 *      Cartola vía email → ingresa el email único del tenant
 *      (cartola+<KEY>@cartola.opai.cl).
 *   2. Santander envía la cartola Excel automáticamente al inbox.
 *   3. Un provider de email inbound (Postmark / Mailgun / Cloudflare
 *      Email Routing) recibe el mensaje, lo parsea (incluyendo adjuntos),
 *      y POSTea JSON a este webhook.
 *   4. Este endpoint identifica el tenant por la KEY del local-part,
 *      detecta el banco por el remitente, parsea el adjunto Excel y
 *      llama a importBankTransactions sobre la cuenta bancaria por
 *      defecto del tenant.
 *
 * Configuración de Postmark (recomendado):
 *   - Crear servidor inbound en Postmark.
 *   - Apuntar MX de `cartola.opai.cl` a `inbound.postmarkapp.com`.
 *   - Webhook URL: https://opai.cl/api/inbound/cartola
 *   - Setear env CARTOLA_INBOUND_TOKEN con el token que Postmark envía
 *     en el body para validar.
 *
 * Formato esperado (compatible con Postmark Inbound):
 *   { From, To, Subject, Attachments: [{ Name, Content (base64), ContentType }] }
 *
 * También acepta formato Mailgun (`recipient`, `attachments[].url`) o
 * cualquier provider que agregue `to`/`from`/`attachments` al body.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractInboxKey,
  tenantInboxKey,
} from "@/modules/finance/banking/cartola-inbox";
import { loadXlsxRows } from "@/modules/finance/banking/xlsx-loader";
import { parseSantanderCartola } from "@/modules/finance/banking/santander-parser";
import { importBankTransactions } from "@/modules/finance/banking/bank-transaction.service";

interface PostmarkAttachment {
  Name?: string;
  name?: string;
  Content?: string; // base64
  content?: string;
  ContentType?: string;
  contentType?: string;
}

interface InboundPayload {
  // Postmark
  From?: string;
  To?: string;
  Subject?: string;
  Attachments?: PostmarkAttachment[];
  // Mailgun / SendGrid
  recipient?: string;
  sender?: string;
  subject?: string;
  attachments?: PostmarkAttachment[];
  // Optional auth
  token?: string;
}

function pick(...vals: (string | undefined)[]): string {
  for (const v of vals) if (v && typeof v === "string") return v;
  return "";
}

/**
 * Detecta el banco por el remitente o asunto. Por ahora solo Santander.
 * Cuando agreguemos otros bancos, este switch crece.
 */
function detectBank(from: string, subject: string): "SANTANDER" | null {
  const text = `${from} ${subject}`.toLowerCase();
  if (text.includes("santander")) return "SANTANDER";
  return null;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const log = (...args: unknown[]) => console.log("[inbound/cartola]", ...args);

  try {
    // Token opcional para evitar abuso. Si la env está seteada, exigirlo.
    const expectedToken = process.env.CARTOLA_INBOUND_TOKEN;
    const headerToken =
      request.headers.get("x-postmark-token") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const body = (await request.json().catch(() => null)) as InboundPayload | null;
    if (!body) {
      return NextResponse.json(
        { success: false, error: "Body inválido" },
        { status: 400 }
      );
    }

    if (
      expectedToken &&
      headerToken !== expectedToken &&
      body.token !== expectedToken
    ) {
      log("token inválido");
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const to = pick(body.To, body.recipient);
    const from = pick(body.From, body.sender);
    const subject = pick(body.Subject, body.subject);
    const attachments = body.Attachments ?? body.attachments ?? [];

    if (!to) {
      return NextResponse.json(
        { success: false, error: "Falta To/recipient" },
        { status: 400 }
      );
    }

    const key = extractInboxKey(to);
    if (!key) {
      log("key no parseable", to);
      return NextResponse.json(
        { success: false, error: "Email destino no calza con formato cartola+KEY@..." },
        { status: 400 }
      );
    }

    // Buscar tenant por key (scan + comparar). Hay pocos tenants y este
    // endpoint se invoca rara vez (1-2 veces por tenant por día), no es
    // hot path. Si crece, se puede agregar un campo indexado.
    const tenants = await prisma.tenant.findMany({
      select: { id: true },
    });
    const tenant = tenants.find((t) => tenantInboxKey(t.id) === key);
    if (!tenant) {
      log("tenant no encontrado para key", key);
      return NextResponse.json(
        { success: false, error: "Tenant no encontrado" },
        { status: 404 }
      );
    }
    const tenantId = tenant.id;

    const bank = detectBank(from, subject);
    if (!bank) {
      log(`banco no reconocido (from=${from}, subject=${subject})`);
      return NextResponse.json(
        {
          success: false,
          error: "Remitente no corresponde a un banco soportado",
        },
        { status: 400 }
      );
    }

    // Buscar cuenta bancaria por defecto del tenant para este banco.
    // Si hay varias, elegir la marcada `isDefault`; si no hay default,
    // la primera activa.
    const accounts = await prisma.financeBankAccount.findMany({
      where: { tenantId, isActive: true, bankCode: { contains: bank, mode: "insensitive" } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      take: 1,
    });
    const account = accounts[0];
    if (!account) {
      // Fallback: cualquier cuenta activa del tenant
      const any = await prisma.financeBankAccount.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1,
      });
      if (!any[0]) {
        return NextResponse.json(
          {
            success: false,
            error: "Tenant sin cuenta bancaria activa. Configurá una primero.",
          },
          { status: 400 }
        );
      }
      // Usar fallback sin filtro de banco
      accounts.push(any[0]);
    }
    const targetAccount = accounts[0];

    // Procesar adjuntos: solo XLSX/XLS.
    const xlsxAttachments = attachments.filter((a) => {
      const name = (a.Name ?? a.name ?? "").toLowerCase();
      const ct = (a.ContentType ?? a.contentType ?? "").toLowerCase();
      return (
        name.endsWith(".xlsx") ||
        name.endsWith(".xls") ||
        ct.includes("spreadsheet") ||
        ct.includes("excel")
      );
    });
    if (xlsxAttachments.length === 0) {
      log("no hay adjuntos Excel");
      return NextResponse.json(
        {
          success: false,
          error: "El email no contiene adjuntos Excel (.xlsx/.xls)",
        },
        { status: 400 }
      );
    }

    let totalImported = 0;
    let totalInFile = 0;
    for (const att of xlsxAttachments) {
      const b64 = att.Content ?? att.content;
      if (!b64) continue;
      const buf = Buffer.from(b64, "base64");

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
        // userId=null → no corre auto-match. La importación queda bruta;
        // las reglas se evalúan después si el usuario corre "Aplicar al
        // histórico" desde Reglas.
        undefined
      );
      totalImported += result.importedCount;
    }

    log(
      `OK tenant=${tenantId} acc=${targetAccount.id} bank=${bank} imported=${totalImported}/${totalInFile} in ${Date.now() - startedAt}ms`
    );

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
  } catch (error) {
    console.error("[inbound/cartola] error:", error);
    const message =
      error instanceof Error ? error.message : "Error procesando email";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
