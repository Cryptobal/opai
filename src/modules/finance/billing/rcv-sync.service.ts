/**
 * RCV (Registro de Compras y Ventas) Sync Service
 *
 * Lee los DTEs RECIBIDOS desde el SII via SimpleAPI y los upserta en
 * FinanceDte (direction=RECEIVED). Idempotente vía la unique constraint
 * (tenantId, direction, dteType, folio) → uq_finance_dte_folio.
 *
 * Endpoint real (basado en SDK oficial chilesystems/SimpleSDK):
 *   POST https://servicios.simpleapi.cl/api/rcv/compras/{mes}/{anio}
 *   - Auth: Basic base64("api:" + apikey)
 *   - Multipart con `input` (JSON BasicData) + `certificado` (cert binario)
 *
 * Response shape:
 *   { caratula: { rutEmpresa, mes, anio, periodo, ... },
 *     compras: { resumenes: [...], detalleCompras: [DetalleRCV] },
 *     ventas:  { resumenes: [...], detalleVentas:  [DetalleRCV] } }
 *
 * Rate limits SimpleAPI RCV: 1/sec, 5/min, 100/hour. El cron route limita
 * las llamadas entre tenants acordemente.
 *
 * NOTA HISTÓRICA: la versión previa usaba el endpoint inexistente
 * `/rcv/recibidos` con auth y content-type incorrectos, copiando el patrón
 * roto que tenía el simpleapi.provider.ts antes del refactor. Esta versión
 * usa el endpoint y formato real verificado contra SimpleAPI cert.
 */

import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import { callSimpleApi } from "../shared/adapters/simpleapi-http";

export interface RcvSyncResult {
  tenantId: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  /** Meses consultados durante este sync (para UX y logging). */
  monthsQueried: string[];
}

/**
 * Shape de cada item dentro de `compras.detalleCompras` que devuelve
 * SimpleAPI. Newtonsoft.Json serializa con nombres C# (PascalCase) por
 * default, pero algunas versiones devuelven camelCase. Aceptamos ambos.
 */
interface SimpleApiDetalleRCV {
  tipoDTE?: number;
  TipoDTE?: number;
  folio?: number | string;
  Folio?: number | string;
  fechaEmision?: string;
  FechaEmision?: string;
  rutProveedor?: string;
  RutProveedor?: string;
  razonSocial?: string;
  RazonSocial?: string;
  montoNeto?: number | null;
  MontoNeto?: number | null;
  montoExento?: number | null;
  MontoExento?: number | null;
  montoIvaRecuperable?: number | null;
  MontoIvaRecuperable?: number | null;
  montoTotal?: number | null;
  MontoTotal?: number | null;
}

interface NormalizedRcvDoc {
  rutEmisor: string;
  razonSocialEmisor: string;
  tipoDte: number;
  folio: number;
  fechaEmision: string;
  montoNeto: number;
  montoExento: number;
  iva: number;
  montoTotal: number;
}

function pick<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v;
  }
  return undefined;
}

function normalizeDetalle(d: SimpleApiDetalleRCV): NormalizedRcvDoc | null {
  const tipoDte = pick(d.tipoDTE, d.TipoDTE);
  const folio = pick(d.folio, d.Folio);
  const fechaEmision = pick(d.fechaEmision, d.FechaEmision);
  const rutProveedor = pick(d.rutProveedor, d.RutProveedor);
  if (!tipoDte || !folio || !fechaEmision || !rutProveedor) return null;

  const montoNeto = Number(pick(d.montoNeto, d.MontoNeto) ?? 0);
  const montoExento = Number(pick(d.montoExento, d.MontoExento) ?? 0);
  const iva = Number(pick(d.montoIvaRecuperable, d.MontoIvaRecuperable) ?? 0);
  const montoTotal = Number(pick(d.montoTotal, d.MontoTotal) ?? 0);
  const razonSocial = String(pick(d.razonSocial, d.RazonSocial) ?? `Proveedor ${rutProveedor}`);

  return {
    rutEmisor: String(rutProveedor),
    razonSocialEmisor: razonSocial,
    tipoDte: Number(tipoDte),
    folio: Number(folio),
    fechaEmision: String(fechaEmision).split("T")[0], // ISO date prefix
    montoNeto,
    montoExento,
    iva,
    montoTotal,
  };
}

/**
 * Sincroniza el RCV para un tenant.
 * - Si nunca se sincronizó: trae el mes actual + 2 meses previos.
 * - Si ya se sincronizó: trae solo desde el último mes sincronizado hasta hoy.
 * Idempotente: re-correr sobre el mismo período solo inserta nuevos folios.
 */
export async function syncTenantRcv(tenantId: string): Promise<RcvSyncResult> {
  const result: RcvSyncResult = {
    tenantId,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
    monthsQueried: [],
  };

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
    result.errors.push(`Tenant ${tenantId} no tiene certificado cargado`);
    return result;
  }
  if (cert.notAfter < new Date()) {
    result.errors.push(
      `Certificado vencido (${cert.notAfter.toISOString().split("T")[0]})`,
    );
    return result;
  }

  let pfxBuffer: Buffer;
  let password: string;
  try {
    pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    password = decryptString(cert.passwordEnc);
  } catch (err) {
    result.errors.push(
      `Error desencriptando certificado: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  const ambiente = config.environment === "PRODUCTION" ? 1 : 0;
  const rcvInput = {
    RutCertificado: cert.rutTitular,
    Password: password,
    RutUsuario: cert.rutTitular,
    PasswordSII: "",
    RutEmpresa: config.emisorRut,
    Ambiente: ambiente,
    Detallado: true,
  };

  // Determinar qué meses consultar.
  // - Sin sync previo: mes actual + 2 anteriores (para tener histórico inicial).
  // - Con sync previo: desde el mes del último sync hasta el actual.
  const now = new Date();
  const periods = computePeriodsToSync(config.lastRcvSyncAt, now);
  result.monthsQueried = periods.map((p) => `${p.mes}/${p.anio}`);

  const allDocs: NormalizedRcvDoc[] = [];

  for (const { mes, anio } of periods) {
    let response;
    try {
      response = await callSimpleApi({
        target: "scraper",
        path: `rcv/compras/${mes}/${anio}`,
        method: "POST",
        parts: [
          { name: "input", content: JSON.stringify(rcvInput) },
          {
            name: "certificado",
            content: pfxBuffer,
            contentType: "application/x-pkcs12",
            filename: "certificado.pfx",
          },
        ],
      });
    } catch (err) {
      result.errors.push(
        `Red SimpleAPI ${mes}/${anio}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    if (!response.ok) {
      result.errors.push(
        `SimpleAPI RCV ${mes}/${anio}: HTTP ${response.status} - ${response.bodyText.slice(0, 200)}`,
      );
      continue;
    }

    const json = response.bodyJson as
      | {
          compras?: { detalleCompras?: SimpleApiDetalleRCV[] };
          Compras?: { DetalleCompras?: SimpleApiDetalleRCV[] };
        }
      | null;
    const detalle =
      json?.compras?.detalleCompras ?? json?.Compras?.DetalleCompras ?? [];

    for (const item of detalle) {
      const norm = normalizeDetalle(item);
      if (norm) allDocs.push(norm);
    }
  }

  result.fetched = allDocs.length;

  for (const doc of allDocs) {
    try {
      const inserted = await upsertReceivedDte(tenantId, doc);
      if (inserted) result.inserted++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(
        `Upsert ${doc.rutEmisor}/${doc.tipoDte}/${doc.folio}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await prisma.tenantDteConfig.update({
    where: { tenantId },
    data: { lastRcvSyncAt: now },
  });

  return result;
}

/**
 * Devuelve la lista de períodos (mes, anio) a consultar dado el último
 * sync. Si nunca se sincronizó, devuelve el mes actual + 2 anteriores.
 */
function computePeriodsToSync(
  lastSyncAt: Date | null,
  now: Date,
): { mes: number; anio: number }[] {
  const currentMonth = now.getUTCMonth() + 1; // 1-12
  const currentYear = now.getUTCFullYear();

  const periods: { mes: number; anio: number }[] = [];

  // Sin historial: 3 meses (current + 2 anteriores).
  if (!lastSyncAt) {
    for (let i = 2; i >= 0; i--) {
      const d = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
      periods.push({ mes: d.getUTCMonth() + 1, anio: d.getUTCFullYear() });
    }
    return periods;
  }

  // Con historial: desde el mes del último sync hasta el actual (inclusive).
  let cur = new Date(
    Date.UTC(lastSyncAt.getUTCFullYear(), lastSyncAt.getUTCMonth(), 1),
  );
  const end = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
  while (cur <= end) {
    periods.push({
      mes: cur.getUTCMonth() + 1,
      anio: cur.getUTCFullYear(),
    });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  // Cap: nunca más de 12 meses por sync para no abusar del rate limit.
  return periods.slice(-12);
}

async function upsertReceivedDte(
  tenantId: string,
  doc: NormalizedRcvDoc,
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
    where: { tenantId_rut: { tenantId, rut: cleanRut } },
    create: {
      tenantId,
      rut: cleanRut,
      name: doc.razonSocialEmisor,
    },
    update: {},
  });

  const totalAmount = Math.round(doc.montoTotal);
  const netAmount = Math.round(doc.montoNeto);
  const exemptAmount = Math.round(doc.montoExento);
  const taxAmount = Math.round(
    doc.iva > 0 ? doc.iva : Math.max(0, totalAmount - netAmount - exemptAmount),
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
      issuerName: doc.razonSocialEmisor,
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
