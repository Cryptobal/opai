/**
 * RCV (Registro de Compras y Ventas) Sync Service
 *
 * Reads received DTEs from SII via SimpleAPI RCV endpoint and upserts them
 * into FinanceDte (direction=RECEIVED). Idempotent via the unique constraint
 * (tenantId, direction, dteType, folio) → uq_finance_dte_folio.
 *
 * Rate limits SimpleAPI RCV: 1/sec, 5/min, 100/hour. The cron route throttles
 * the calls between tenants accordingly.
 */

import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";

const BASE_URL = process.env.SIMPLEAPI_BASE_URL ?? "https://api.simpleapi.cl";
const API_KEY = process.env.SIMPLEAPI_KEY ?? "";

export interface RcvSyncResult {
  tenantId: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

interface RcvDocItem {
  rutEmisor: string;
  razonSocialEmisor?: string;
  tipoDte: number;
  folio: number;
  fechaEmision: string;
  montoNeto?: number;
  montoExento?: number;
  iva?: number;
  montoTotal: number;
}

/**
 * Sync RCV for a single tenant.
 * Idempotent: re-running over the same period only inserts new folios.
 */
export async function syncTenantRcv(tenantId: string): Promise<RcvSyncResult> {
  const result: RcvSyncResult = {
    tenantId,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  if (!API_KEY) {
    result.errors.push("SIMPLEAPI_KEY no configurada en el servidor");
    return result;
  }

  const config = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
  });
  if (!config?.isActive || !config.emisorRut) {
    result.errors.push(`Tenant ${tenantId} no tiene config DTE activa`);
    return result;
  }

  const cert = await prisma.tenantDteCertificate.findUnique({
    where: { tenantId },
  });
  if (!cert) {
    result.errors.push(`Tenant ${tenantId} no tiene certificado`);
    return result;
  }
  if (cert.notAfter < new Date()) {
    result.errors.push(
      `Certificado vencido (${cert.notAfter.toISOString().split("T")[0]})`
    );
    return result;
  }

  const pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
  const password = decryptString(cert.passwordEnc);

  // 30-day lookback when there's no prior sync.
  const desde = config.lastRcvSyncAt
    ? new Date(config.lastRcvSyncAt)
    : new Date(Date.now() - 30 * 86400000);
  const hasta = new Date();

  const desdeStr = desde.toISOString().split("T")[0];
  const hastaStr = hasta.toISOString().split("T")[0];

  // SimpleAPI RCV recibidos endpoint. Validate exact path against Postman docs
  // (documentacion.simpleapi.cl) during the free-tier integration test and
  // adjust if needed.
  let docs: RcvDocItem[] = [];
  try {
    const res = await fetch(`${BASE_URL}/rcv/recibidos`, {
      method: "POST",
      headers: { Authorization: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        RutEmisor: config.emisorRut,
        Ambiente: config.environment === "PRODUCTION" ? 1 : 0,
        Desde: desdeStr,
        Hasta: hastaStr,
        Certificado: {
          Pfx: pfxBuffer.toString("base64"),
          Password: password,
        },
      }),
    });
    const body = await res.json();
    if (!res.ok || body?.status !== 200) {
      result.errors.push(
        `SimpleAPI RCV: HTTP ${res.status} - ${body?.message ?? "error"}`
      );
      return result;
    }
    docs = (body.data ?? []) as RcvDocItem[];
  } catch (err) {
    result.errors.push(
      `Error llamando SimpleAPI RCV: ${(err as Error).message}`
    );
    return result;
  }

  result.fetched = docs.length;

  for (const doc of docs) {
    try {
      const inserted = await upsertReceivedDte(tenantId, doc);
      if (inserted) result.inserted++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(
        `Error upserting ${doc.rutEmisor}/${doc.tipoDte}/${doc.folio}: ${(err as Error).message}`
      );
    }
  }

  await prisma.tenantDteConfig.update({
    where: { tenantId },
    data: { lastRcvSyncAt: hasta },
  });

  return result;
}

async function upsertReceivedDte(
  tenantId: string,
  doc: RcvDocItem
): Promise<boolean> {
  const existing = await prisma.financeDte.findFirst({
    where: {
      tenantId,
      direction: "RECEIVED",
      dteType: doc.tipoDte,
      folio: doc.folio,
    },
    select: { id: true },
  });
  if (existing) return false;

  const cleanRut = doc.rutEmisor.replace(/[^\dKk-]/g, "").toUpperCase();
  const supplier = await prisma.financeSupplier.upsert({
    where: {
      tenantId_rut: { tenantId, rut: cleanRut },
    },
    create: {
      tenantId,
      rut: cleanRut,
      name: doc.razonSocialEmisor ?? `Proveedor ${cleanRut}`,
    },
    update: {},
  });

  const totalAmount = Math.round(doc.montoTotal);
  const netAmount = Math.round(doc.montoNeto ?? 0);
  const exemptAmount = Math.round(doc.montoExento ?? 0);
  const taxAmount = Math.round(
    doc.iva ?? Math.max(0, totalAmount - netAmount - exemptAmount)
  );

  const code = `RCV-${doc.tipoDte}-${doc.folio}`;

  await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "RECEIVED",
      dteType: doc.tipoDte,
      folio: doc.folio,
      code,
      date: new Date(doc.fechaEmision),
      issuerRut: cleanRut,
      issuerName: doc.razonSocialEmisor ?? `Proveedor ${cleanRut}`,
      receiverRut: "",
      receiverName: "",
      currency: "CLP",
      netAmount,
      exemptAmount,
      taxRate: 19,
      taxAmount,
      totalAmount,
      siiStatus: "ACCEPTED",
      receptionStatus: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: totalAmount,
      supplierId: supplier.id,
      createdBy: "system:rcv-sync",
    },
  });

  return true;
}
