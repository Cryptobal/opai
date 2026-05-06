/**
 * RCV Ventas Sync Service
 *
 * Importa los DTEs EMITIDOS del tenant desde el SII via SimpleAPI y los
 * upserta en FinanceDte (direction=ISSUED). Sirve para traer todas las
 * facturas que el tenant emitió ANTES de usar OPAI (Zoho, papel, otros
 * sistemas) y siguen registradas en el SII.
 *
 * Idempotente vía la unique constraint (tenantId, direction, dteType, folio).
 *
 * Endpoint real (basado en SDK oficial chilesystems/SimpleSDK):
 *   POST https://servicios.simpleapi.cl/api/rcv/ventas/{mes}/{anio}
 *   - Auth: Basic base64("api:" + apikey)
 *   - Multipart con `input` (JSON BasicData) + `certificado` (cert binario)
 *
 * Response shape (según SDK SimpleSDK.RegistroComprasVentas):
 *   { caratula: { rutEmpresa, mes, anio, periodo, ... },
 *     ventas:  { resumenes: [...], detalleVentas: [DetalleRCV] } }
 *
 * Diferencias vs RCV de compras:
 *   - direction: ISSUED (no RECEIVED)
 *   - el detalle viene en `ventas.detalleVentas` (no `compras.detalleCompras`)
 *   - en lugar de "rutProveedor" tenemos "rutReceptor"
 *   - los DTEs vienen ya con `siiStatus: ACCEPTED` (el SII los confirmó)
 *   - no creamos supplier (es nuestro propio receptor); guardamos sólo
 *     receiverRut + receiverName en el FinanceDte. Si el receptor coincide
 *     con un account del CRM por RUT, podemos enriquecer en una sub-fase
 *     futura.
 *
 * NOTA SOBRE FOLIOS Y CONFLICTOS:
 *   Si una factura se emitió por OPAI y AHORA viene en el RCV ventas,
 *   el upsert detecta por (tenantId, direction, dteType, folio) y la
 *   skipea (ya existe). No se sobreescribe nada — la versión OPAI
 *   tiene más datos (lines, dteXml para PDF, refs).
 */

import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import { callSimpleApi, detectApiKeyBlocked } from "../shared/adapters/simpleapi-http";

export interface RcvVentasSyncResult {
  tenantId: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  /** Meses consultados durante este sync (para UX y logging). */
  monthsQueried: string[];
}

/**
 * Shape de cada item dentro de `ventas.detalleVentas` que devuelve
 * SimpleAPI. Newtonsoft.Json puede serializar PascalCase o camelCase,
 * aceptamos ambos.
 */
interface SimpleApiDetalleVenta {
  tipoDTE?: number;
  TipoDTE?: number;
  folio?: number | string;
  Folio?: number | string;
  fechaEmision?: string;
  FechaEmision?: string;
  rutReceptor?: string;
  RutReceptor?: string;
  razonSocial?: string;
  RazonSocial?: string;
  montoNeto?: number | null;
  MontoNeto?: number | null;
  montoExento?: number | null;
  MontoExento?: number | null;
  montoIva?: number | null;
  MontoIva?: number | null;
  montoTotal?: number | null;
  MontoTotal?: number | null;
}

interface NormalizedVentaDoc {
  rutReceptor: string;
  razonSocialReceptor: string;
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

function normalizeDetalle(d: SimpleApiDetalleVenta): NormalizedVentaDoc | null {
  const tipoDte = pick(d.tipoDTE, d.TipoDTE);
  const folio = pick(d.folio, d.Folio);
  const fechaEmision = pick(d.fechaEmision, d.FechaEmision);
  const rutReceptor = pick(d.rutReceptor, d.RutReceptor);
  if (!tipoDte || !folio || !fechaEmision || !rutReceptor) return null;

  const montoNeto = Number(pick(d.montoNeto, d.MontoNeto) ?? 0);
  const montoExento = Number(pick(d.montoExento, d.MontoExento) ?? 0);
  const iva = Number(pick(d.montoIva, d.MontoIva) ?? 0);
  const montoTotal = Number(pick(d.montoTotal, d.MontoTotal) ?? 0);
  const razonSocial = String(
    pick(d.razonSocial, d.RazonSocial) ?? `Cliente ${rutReceptor}`,
  );

  return {
    rutReceptor: String(rutReceptor),
    razonSocialReceptor: razonSocial,
    tipoDte: Number(tipoDte),
    folio: Number(folio),
    fechaEmision: String(fechaEmision).split("T")[0],
    montoNeto,
    montoExento,
    iva,
    montoTotal,
  };
}

/**
 * Sincroniza el RCV de ventas para un tenant.
 *
 * Si nunca se sincronizó: trae los últimos 12 meses (default histórico
 * razonable para empezar a ver informes y balances con datos reales).
 * Si ya se sincronizó: trae solo desde el mes del último sync hasta hoy.
 */
export async function syncTenantRcvVentas(
  tenantId: string,
  options: { monthsBack?: number } = {},
): Promise<RcvVentasSyncResult> {
  const result: RcvVentasSyncResult = {
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

  const now = new Date();
  const periods = computePeriodsToSync(
    config.lastRcvVentasSyncAt,
    now,
    options.monthsBack ?? 12,
  );
  result.monthsQueried = periods.map((p) => `${p.mes}/${p.anio}`);

  const allDocs: NormalizedVentaDoc[] = [];

  for (const { mes, anio } of periods) {
    let response;
    try {
      response = await callSimpleApi({
        target: "scraper",
        path: `rcv/ventas/${mes}/${anio}`,
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

    // Detectar bloqueo de apikey: abortar todo el sync (no tiene sentido
    // seguir reintentando si la apikey está bloqueada por cupo o rate limit).
    const blocked = detectApiKeyBlocked(response);
    if (blocked.blocked) {
      result.errors.push(`API_KEY_${blocked.reason}: ${blocked.message}`);
      // No actualizamos lastRcvVentasSyncAt para que el próximo intento
      // (cuando se desbloquee) reintente desde el mismo cursor.
      return result;
    }

    if (!response.ok) {
      result.errors.push(
        `SimpleAPI RCV ventas ${mes}/${anio}: HTTP ${response.status} - ${response.bodyText.slice(0, 200)}`,
      );
      continue;
    }

    const json = response.bodyJson as
      | {
          ventas?: { detalleVentas?: SimpleApiDetalleVenta[] };
          Ventas?: { DetalleVentas?: SimpleApiDetalleVenta[] };
        }
      | null;
    const detalle =
      json?.ventas?.detalleVentas ?? json?.Ventas?.DetalleVentas ?? [];

    for (const item of detalle) {
      const norm = normalizeDetalle(item);
      if (norm) allDocs.push(norm);
    }
  }

  result.fetched = allDocs.length;

  for (const doc of allDocs) {
    try {
      const inserted = await upsertIssuedDteFromRcv(tenantId, doc);
      if (inserted) result.inserted++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(
        `Upsert ${doc.rutReceptor}/${doc.tipoDte}/${doc.folio}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await prisma.tenantDteConfig.update({
    where: { tenantId },
    data: { lastRcvVentasSyncAt: now },
  });

  return result;
}

/**
 * Devuelve la lista de períodos (mes, anio) a consultar dado el último
 * sync. Sin historial: trae `monthsBack` meses anteriores (default 12).
 * Con historial: desde el mes del último sync hasta el actual.
 */
function computePeriodsToSync(
  lastSyncAt: Date | null,
  now: Date,
  monthsBack: number,
): { mes: number; anio: number }[] {
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();

  const periods: { mes: number; anio: number }[] = [];

  if (!lastSyncAt) {
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
      periods.push({ mes: d.getUTCMonth() + 1, anio: d.getUTCFullYear() });
    }
    return periods;
  }

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
  // Cap: nunca más de 60 meses por sync (5 años — suficiente para casi
  // cualquier histórico). Rate limit SimpleAPI: 1/sec, 5/min, 100/hour.
  return periods.slice(-60);
}

async function upsertIssuedDteFromRcv(
  tenantId: string,
  doc: NormalizedVentaDoc,
): Promise<boolean> {
  const existing = await prisma.financeDte.findFirst({
    where: {
      tenantId,
      direction: "ISSUED",
      dteType: doc.tipoDte,
      folio: doc.folio,
    },
    select: { id: true },
  });
  if (existing) return false;

  const cleanRut = doc.rutReceptor.replace(/[^\dKk-]/g, "").toUpperCase();

  const totalAmount = Math.round(doc.montoTotal);
  const netAmount = Math.round(doc.montoNeto);
  const exemptAmount = Math.round(doc.montoExento);
  const taxAmount = Math.round(
    doc.iva > 0 ? doc.iva : Math.max(0, totalAmount - netAmount - exemptAmount),
  );

  const code = `RCVV-${doc.tipoDte}-${doc.folio}`;

  // El tenant es el EMISOR. Recuperamos su info para los campos issuer*.
  const tenantConfig = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
    select: { emisorRut: true, emisorRazonSocial: true },
  });

  await prisma.financeDte.create({
    data: {
      tenantId,
      direction: "ISSUED",
      dteType: doc.tipoDte,
      folio: doc.folio,
      code,
      date: new Date(doc.fechaEmision),
      issuerRut: tenantConfig?.emisorRut ?? "",
      issuerName: tenantConfig?.emisorRazonSocial ?? "",
      receiverRut: cleanRut,
      receiverName: doc.razonSocialReceptor,
      currency: "CLP",
      netAmount,
      exemptAmount,
      taxRate: 19,
      taxAmount,
      totalAmount,
      // Estos DTEs ya están aceptados por el SII (vienen del RCV histórico).
      siiStatus: "ACCEPTED",
      // Para los emitidos no usamos receptionStatus (eso es de recibidos);
      // Prisma requiere un valor del enum, usamos PENDING_REVIEW pero
      // semánticamente no aplica.
      receptionStatus: "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: totalAmount,
      createdBy: "system:rcv-ventas-sync",
    },
  });

  return true;
}
