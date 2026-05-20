/**
 * Service de cesión de DTE a una empresa de factoring (Bloque 3 v3).
 *
 * Orquesta:
 *   1. Validar pre-condiciones (DTE cedible, ACEPTADO, no duplicado, XML local)
 *   2. Resolver tenant context (DTE, FactoringCompany del catálogo, cert via provider)
 *   3. Calcular términos económicos
 *   4. Llamar al adapter `cede()` (genera AEC + envía a RPETC)
 *   5. Persistir FinanceFactoringOperation (SUBMITTED o APPROVED si el
 *      proveedor ya devolvió EOK/EPR, p. ej. Octava) y traza JSON en
 *      `cession_rpetc_raw`.
 *
 * Multi-tenant: TODAS las queries filtran por tenantId.
 *
 * V1 — solo cesión TOTAL (montoCesion = invoiceAmount), secuencia 1, no
 * re-cesión, no parcial. Tipos de DTE cedibles: 33, 34, 43, 46.
 */

import { parseDteXml } from "@/lib/dte-xml-parser";
import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/dte-encryption";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";
import type { DteCedeRequest, DteCedeResponse } from "../shared/adapters/dte-provider.adapter";
import { getFactoringCompany } from "./factoring-companies.service";
import {
  buildInitialCessionRpetcSnapshot,
  isTerminalRpetcAcceptedCode,
} from "./cession-trace.util";

/** Tipos de DTE que la Ley 19.983 declara cedibles (referencia informativa). */
const CEDIBLE_DTE_TYPES = new Set<number>([33, 34, 43, 46]);

export interface CedeDteInput {
  dteId: string;
  factoringCompanyId: string;
  fechaCesion: string; // YYYY-MM-DD
  fechaVencimiento: string; // YYYY-MM-DD
  /** % anticipo sobre el bruto (típicamente 80-90%). */
  advanceRate: number;
  /** % interés MENSUAL (se prorratea por días reales). */
  interestRate: number;
  /** Comisión en CLP (monto fijo). Viene del catálogo de empresas de factoring
   *  o se ingresa manualmente en el modal de cesión. */
  commissionAmount: number;
  emailDeudor?: string;
  notes?: string;
  contactNombre?: string;
  contactFono?: string;
  contactEmail?: string;
  /** Datos del PDF de simulación subido por el usuario. Opcional — si
   *  no viene, la cesión se persiste sólo con las tasas calculadas. */
  simulation?: SimulationSnapshot;
  /** Si la cesión es parte de un batch (Fase 2), el id del batch. La
   *  función NO crea el batch — eso lo hace el wrapper bulkCedeDtes. */
  batchId?: string;
}

/** Datos extraídos del PDF de simulación del factoring (Fase 1). */
export interface SimulationSnapshot {
  fileUrl?: string | null;
  fileKey?: string | null;
  fileName?: string | null;
  /** JSON crudo devuelto por la IA, para auditoría/diagnóstico. */
  extractedJson?: unknown;
  montoBruto?: number | null;
  montoAGirar?: number | null;
  difPrecio?: number | null;
  comision?: number | null;
  iva?: number | null;
  gastosLegal?: number | null;
  notaria?: number | null;
  gastosOperacionales?: number | null;
}

export interface CedeDteContext {
  tenantId: string;
  userId: string;
}

interface EconomicTerms {
  invoiceAmount: number;
  montoCesion: number;
  plazoDias: number;
  advanceAmount: number;
  interestAmount: number;
  commissionAmount: number;
  netAdvance: number;
  retentionAmount: number;
}

/**
 * Calcula los términos económicos de la cesión.
 * V1: cesión TOTAL → montoCesion = invoiceAmount.
 * Interés mensual prorrateado por días reales (base 30).
 */
export function calculateEconomicTerms(
  invoiceAmount: number,
  fechaCesion: string,
  fechaVencimiento: string,
  advanceRatePct: number,
  interestRatePct: number,
  commissionAmountClp: number,
): EconomicTerms {
  const cesionDate = new Date(`${fechaCesion}T00:00:00Z`);
  const vencDate = new Date(`${fechaVencimiento}T00:00:00Z`);
  const diffMs = vencDate.getTime() - cesionDate.getTime();
  const plazoDias = Math.max(1, Math.round(diffMs / 86400000));

  const advanceAmount = round2(invoiceAmount * (advanceRatePct / 100));
  const interestAmount = round2(
    advanceAmount * (interestRatePct / 100) * (plazoDias / 30),
  );
  const commissionAmount = round2(Math.max(0, commissionAmountClp));
  const netAdvance = round2(advanceAmount - interestAmount - commissionAmount);
  const retentionAmount = round2(invoiceAmount - advanceAmount);

  return {
    invoiceAmount: round2(invoiceAmount),
    montoCesion: round2(invoiceAmount),
    plazoDias,
    advanceAmount,
    interestAmount,
    commissionAmount,
    netAdvance,
    retentionAmount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * El SII/AppOCTAVA espera RUT chileno sin puntos y con guion antes del DV
 * (ej: 12345678-9). Nuestro catálogo guarda algunos RUTs limpios sin guion.
 */
function formatRutForSii(raw: string): string {
  const clean = raw.replace(/[.\-\s]/g, "").toUpperCase();
  if (clean.length < 2) return raw.trim();
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * App Octava documenta MONTOCEDER = «monto total DTE a ceder» — debe coincidir con
 * `<MntTotal>` del XML firmado. Si mandamos el total de BD con drift de redondeo o
 * TZ distinta en `FchEmis`, el RPETC responde **RSC** (error de schema).
 *
 * Cuando no hay NC aplicadas al DTE, forzamos fecha/monto/total desde el XML parseado.
 * Con NC el monto cedible puede ser menor: conservamos `montoCesionEconomico`.
 */
function alignCedePayloadWithParsedDteXml(
  dteXml: Buffer,
  sinNotasCreditoAplicadas: boolean,
  fechaEmisionDbIso: string,
  totalAmountDb: number,
  montoCesionEconomico: number,
): {
  dteDate: string;
  dteTotalAmount: number;
  montoCesion: number;
} {
  let dteDate = fechaEmisionDbIso;
  let dteTotalAmount = totalAmountDb;
  let montoCesion = montoCesionEconomico;
  try {
    const p = parseDteXml(dteXml);
    if (ISO_DATE_ONLY.test(p.fechaEmision)) {
      dteDate = p.fechaEmision;
    }
    const xmlTot = p.totales.total;
    if (Number.isFinite(xmlTot) && xmlTot > 0) {
      dteTotalAmount = xmlTot;
      if (sinNotasCreditoAplicadas) {
        montoCesion = xmlTot;
      }
    }
  } catch {
    // Sin parseo fiable no alineamos — evitamos romper DTEs legacy/raros.
  }
  return { dteDate, dteTotalAmount, montoCesion };
}

/**
 * Genera un código humano único per-tenant para la operación.
 * Formato: CES-YYYYMMDD-NNNN (NNNN = secuencia del día).
 */
async function generateOperationCode(tenantId: string, date: Date): Promise<string> {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const datePrefix = `CES-${yyyy}${mm}${dd}`;
  const count = await prisma.financeFactoringOperation.count({
    where: { tenantId, code: { startsWith: datePrefix } },
  });
  return `${datePrefix}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Validaciones pre-condición. Devuelve el DTE cargado o un error explícito.
 */
async function validateAndLoadDte(tenantId: string, dteId: string) {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "ISSUED" },
    select: {
      id: true,
      tenantId: true,
      dteType: true,
      folio: true,
      date: true,
      issuerRut: true,
      receiverRut: true,
      receiverName: true,
      receiverEmail: true,
      totalAmount: true,
      siiStatus: true,
      dteXml: true,
    },
  });
  if (!dte) throw new Error("DTE no encontrado en este tenant.");
  // Tipo cedible: la Ley 19.983 lista 33/34/43/46. Mantenemos la lista
  // como referencia informativa pero NO bloqueamos al usuario — el SII
  // rechazará la cesión con un error claro si el tipo no es cedible.
  // Antes el guard frontend/backend escondía el botón y el equipo no
  // podía ni intentar la operación; ahora dejamos que la cesión avance
  // y el provider/SII devuelve el error real si aplica.
  void CEDIBLE_DTE_TYPES; // marcador de uso intencional
  // El XML local sigue siendo requerido técnicamente: el AEC se
  // construye a partir del XML del DTE original. Sin él no hay cesión
  // posible, no es una restricción de policy.
  if (!dte.dteXml || dte.dteXml.length === 0) {
    throw new Error(
      "El DTE no tiene XML almacenado en la BD. Solo se pueden ceder DTEs emitidos desde OPAI (no importados).",
    );
  }

  // No duplicado: ninguna cesión activa (no cancelada) sobre este DTE.
  const activeStatuses = ["SUBMITTED", "APPROVED", "FUNDED", "COLLECTED", "CLOSED"] as const;
  const existing = await prisma.financeFactoringOperation.findFirst({
    where: {
      tenantId,
      dteId,
      status: { in: [...activeStatuses] },
    },
    select: { id: true, code: true, status: true },
  });
  if (existing) {
    throw new Error(
      `Este DTE ya tiene una cesión activa (${existing.code}, estado ${existing.status}). Cancelala antes de crear otra.`,
    );
  }

  return dte;
}

/**
 * Entry point del bloque cesión. Genera y envía el AEC al RPETC, y
 * persiste la operación en estado SUBMITTED. La aprobación final
 * (status APPROVED) la marca el cron del Bloque 9 cuando el SII
 * confirma EOK vía SOAP.
 */
export async function cedeDte(
  input: CedeDteInput,
  ctx: CedeDteContext,
): Promise<{ operationId: string; code: string; trackId: string }> {
  // 1. Validar y cargar DTE.
  const dte = await validateAndLoadDte(ctx.tenantId, input.dteId);

  // 2. Resolver factoring company del catálogo (snapshot).
  const company = await getFactoringCompany(ctx.tenantId, input.factoringCompanyId);
  if (!company) {
    throw new Error("Empresa de factoring no encontrada en el catálogo.");
  }
  if (!company.isActive) {
    throw new Error("La empresa de factoring está inactiva.");
  }

  // 3. Cargar config DTE del tenant para snapshot del cedente.
  // Selección extendida: incluir cessionProvider + environment para
  // poder bifurcar el adapter (SII_DIRECT vs SIMPLEAPI vs STUB) y
  // pfxDataEnc/passwordEnc para descifrar el cert in-memory si vamos
  // por el adapter directo.
  const dteCfg = await prisma.tenantDteConfig.findUnique({
    where: { tenantId: ctx.tenantId },
    select: {
      emisorRazonSocial: true,
      emisorDireccion: true,
      emisorEmail: true,
      cessionProvider: true,
      environment: true,
    },
  });
  if (!dteCfg) {
    throw new Error("Tenant sin TenantDteConfig — completá los datos en /opai/configuracion/finanzas/dte.");
  }
  const cert = await prisma.tenantDteCertificate.findUnique({
    where: { tenantId: ctx.tenantId },
    select: {
      rutTitular: true,
      nombreTitular: true,
      pfxDataEnc: true,
      passwordEnc: true,
    },
  });
  if (!cert) {
    throw new Error("Tenant sin certificado digital — subí un .pfx en la config DTE.");
  }

  // 4. Calcular términos económicos sobre el SALDO NETO, no el total
  // bruto. Si el DTE original tiene NCs aceptadas (parciales o totales),
  // el monto cedible es total - NCs. Antes mandábamos el total bruto al
  // RPETC y el factoring reclamaba al deudor un monto mayor al que en
  // realidad le debía → lío legal.
  const totalBruto = Number(dte.totalAmount);
  const ncAggregate = await prisma.financeDte.aggregate({
    where: {
      tenantId: ctx.tenantId,
      direction: "ISSUED",
      dteType: 61,
      referenceDteId: dte.id,
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
    },
    _sum: { totalAmount: true },
  });
  const ncAplicadas = ncAggregate._sum.totalAmount?.toNumber() ?? 0;
  const saldoCedible = totalBruto - ncAplicadas;
  if (saldoCedible <= 0) {
    throw new Error(
      `El DTE no tiene saldo cedible (total $${totalBruto.toLocaleString("es-CL")} − NCs $${ncAplicadas.toLocaleString("es-CL")} = $${saldoCedible.toLocaleString("es-CL")}). Está totalmente anulado por NC.`,
    );
  }

  const baseTerms = calculateEconomicTerms(
    saldoCedible,
    input.fechaCesion,
    input.fechaVencimiento,
    input.advanceRate,
    input.interestRate,
    input.commissionAmount,
  );
  // Single source: si vinieron los CLP del cesionario (PDF o tipeados),
  // pisamos los amounts calculados con los reales. Eso elimina la
  // discrepancia ~$300 entre "estimado" y "PDF" en la cesión persistida.
  const overrideInterest =
    input.simulation?.difPrecio != null && input.simulation.difPrecio >= 0
      ? input.simulation.difPrecio
      : null;
  const overrideNetAdvance =
    input.simulation?.montoAGirar != null && input.simulation.montoAGirar >= 0
      ? input.simulation.montoAGirar
      : null;
  const terms = {
    ...baseTerms,
    interestAmount: overrideInterest ?? baseTerms.interestAmount,
    netAdvance: overrideNetAdvance ?? baseTerms.netAdvance,
  };

  // 5. Construir el request común y llamar al adapter correcto según
  // `cessionProvider` (default SII_DIRECT — ver migration
  // 20260808000000). El adapter directo construye/firma/envía el AEC
  // sin pasar por SimpleAPI; el legacy SIMPLEAPI sigue disponible para
  // tenants que tengan ese módulo en su plan.
  const emailDeudorTrimmed =
    input.emailDeudor?.trim() || dte.receiverEmail?.trim() || "";
  const emailDeudor = emailDeudorTrimmed || undefined;

  const cessionProvider = dteCfg.cessionProvider ?? "SII_DIRECT";
  if (cessionProvider === "OCTAVA" && !emailDeudorTrimmed) {
    throw new Error(
      "Para cesión con App Octava se requiere el correo del deudor (receptor del DTE). " +
        "Completá \"Email deudor\" en el modal o actualizá el email del receptor en la cuenta CRM antes de ceder.",
    );
  }

  const sinNcSobreEsteDte = ncAplicadas < 0.01;
  const xmlBuf = Buffer.from(dte.dteXml as Buffer);
  const rpetcAligned = alignCedePayloadWithParsedDteXml(
    xmlBuf,
    sinNcSobreEsteDte,
    dte.date.toISOString().slice(0, 10),
    Number(dte.totalAmount),
    terms.montoCesion,
  );
  const invoiceAmountPersist =
    sinNcSobreEsteDte &&
    Math.abs(rpetcAligned.dteTotalAmount - terms.invoiceAmount) > 0.01
      ? rpetcAligned.dteTotalAmount
      : terms.invoiceAmount;

  const cedeRequest: DteCedeRequest = {
    dteType: dte.dteType,
    dteFolio: dte.folio,
    dteIssuerRut: formatRutForSii(dte.issuerRut),
    dteReceiverRut: formatRutForSii(dte.receiverRut),
    // Razón social del deudor — necesaria para que el adapter directo
    // arme la <DeclaracionJurada> Ley 19.983 con el nombre. SimpleAPI
    // la ignora (la extrae del XML), no afecta su flow.
    dteReceiverName: dte.receiverName ?? undefined,
    dteDate: rpetcAligned.dteDate,
    dteTotalAmount: rpetcAligned.dteTotalAmount,
    dteXml: xmlBuf,
    cesionarioRut: formatRutForSii(company.rut),
    cesionarioRazonSocial: company.razonSocial,
    cesionarioDireccion: company.direccion ?? "",
    cesionarioEmail: company.email ?? "",
    cedenteRazonSocial: dteCfg.emisorRazonSocial ?? dte.receiverName ?? "",
    cedenteDireccion: dteCfg.emisorDireccion ?? "",
    cedenteEmail: dteCfg.emisorEmail ?? "",
    rutAutorizadoNombre: cert.nombreTitular ?? "Representante Legal",
    rutAutorizadoRut: formatRutForSii(cert.rutTitular),
    montoCesion: rpetcAligned.montoCesion,
    fechaUltimoVencimiento: input.fechaVencimiento,
    emailDeudor,
    contactNombre: input.contactNombre ?? cert.nombreTitular ?? "Contacto Cesión",
    contactFono: input.contactFono,
    contactEmail: input.contactEmail ?? dteCfg.emisorEmail ?? "noreply@opai.cl",
  };

  let cedeResult: DteCedeResponse;
  if (cessionProvider === "SII_DIRECT") {
    // Descifrar el cert in-memory para el adapter directo. NO se loguea
    // ni se persiste — solo viaja por la stack hasta sendAecToSii.
    const pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    const pfxPassword = decryptString(cert.passwordEnc);
    const env = dteCfg.environment === "PRODUCTION" ? "PRODUCTION" : "CERTIFICATION";
    const { cedeDteSiiDirect } = await import(
      "../shared/adapters/sii-direct-cesion"
    );
    cedeResult = await cedeDteSiiDirect(cedeRequest, {
      environment: env,
      pfxBuffer,
      pfxPassword,
      rutTitular: cert.rutTitular,
      emailNotif: dteCfg.emisorEmail ?? "noreply@opai.cl",
    });
  } else if (cessionProvider === "OCTAVA") {
    // App Octava (cesión-as-a-service): firma y envía AEC al SII por nosotros
    // usando nuestro cert. Requiere OCTAVA_INTEGRADOR_RUT/PASSWORD en env.
    const pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    const pfxPassword = decryptString(cert.passwordEnc);
    const env = dteCfg.environment === "PRODUCTION" ? "PRODUCTION" : "CERTIFICATION";
    const { cedeDteOctava } = await import("../shared/adapters/octava-cesion");
    cedeResult = await cedeDteOctava(
      cedeRequest,
      {
        tenantId: ctx.tenantId,
        environment: env,
        pfxBuffer,
        pfxPassword,
        rutTitular: cert.rutTitular,
        nombreTitular: cert.nombreTitular ?? "Representante Legal",
        razonSocialEmisor: dteCfg.emisorRazonSocial ?? "Sin Razón Social",
      },
      // No hacer polling: devolver SUBMITTED de inmediato y dejar que
      // el cron factoring-status actualice el estado final (EOK/RSC).
      // Evita que el modal tarde 1-7 min esperando al SII.
      { pollFinal: false },
    );
  } else {
    const provider = await getDteProvider(ctx.tenantId);
    cedeResult = await provider.cede(cedeRequest);
  }

  if (!cedeResult.success) {
    throw new Error(cedeResult.error ?? "Error desconocido al ceder el DTE.");
  }

  // Si el proveedor ya devolvió aceptación terminal (p. ej. Octava EOK tras
  // ConsultaEstadoAEC), aprobamos de inmediato. El cron SOAP solo aplica a
  // trackId numérico RPETC — no a URLs de descarga del proveedor.
  const terminalOk = isTerminalRpetcAcceptedCode(cedeResult.status);
  const submittedAt = new Date();

  // 6. Persistir operación (+ traza JSON para auditoría / soporte).
  // Si vino simulación del factoring, derivamos costo financiero real y
  // tasa efectiva mensual para comparar empresas más tarde.
  const sim = input.simulation;
  const simMontoAGirar = sim?.montoAGirar ?? null;
  const costoFinanciero =
    simMontoAGirar != null
      ? Math.max(0, invoiceAmountPersist - simMontoAGirar)
      : null;
  // Guardado como porcentaje (mismas unidades que `interest_rate`).
  // Ej: $149.975 de costo sobre $5.306.452 de anticipo en 60 días →
  // (149975 / 5306452) × (30 / 60) × 100 ≈ 1,4128 → guarda 1.4128.
  const effectiveMonthlyRate =
    costoFinanciero != null && terms.advanceAmount > 0 && terms.plazoDias > 0
      ? Math.round(
          (costoFinanciero / terms.advanceAmount) *
            (30 / terms.plazoDias) *
            100 *
            10000,
        ) / 10000
      : null;

  const code = await generateOperationCode(ctx.tenantId, new Date());
  const op = await prisma.financeFactoringOperation.create({
    data: {
      tenantId: ctx.tenantId,
      code,
      dteId: dte.id,
      factoringCompany: company.razonSocial,
      factoringCompanyId: company.id,
      cesionarioRut: company.rut,
      cesionarioRazonSoc: company.razonSocial,
      cesionarioEmail: company.email,
      cesionarioDireccion: company.direccion,
      invoiceAmount: invoiceAmountPersist,
      montoCesion: rpetcAligned.montoCesion,
      plazoDias: terms.plazoDias,
      fechaCesion: new Date(`${input.fechaCesion}T00:00:00Z`),
      fechaVencimiento: new Date(`${input.fechaVencimiento}T00:00:00Z`),
      advanceRate: input.advanceRate,
      advanceAmount: terms.advanceAmount,
      interestRate: input.interestRate,
      interestAmount: terms.interestAmount,
      commissionAmount: terms.commissionAmount,
      netAdvance: terms.netAdvance,
      retentionAmount: terms.retentionAmount,
      emailDeudor: emailDeudorTrimmed || null,
      cessionMethod: "ELECTRONIC",
      cessionRegistered: true,
      cessionDate: new Date(`${input.fechaCesion}T00:00:00Z`),
      aecXml: cedeResult.aecXml ? Buffer.from(cedeResult.aecXml) : null,
      aecTrackId: cedeResult.trackId ?? null,
      cessionSiiStatus: cedeResult.status ?? null,
      cessionRpetcRaw: buildInitialCessionRpetcSnapshot(cedeResult),
      status: terminalOk ? "APPROVED" : "SUBMITTED",
      submittedAt,
      approvedAt: terminalOk ? submittedAt : null,
      notes: input.notes ?? null,
      createdBy: ctx.userId,
      // ── Simulación del cesionario (PDF + IA) ──
      simulationFileUrl: sim?.fileUrl ?? null,
      simulationFileKey: sim?.fileKey ?? null,
      simulationFileName: sim?.fileName ?? null,
      simulationExtractedAt: sim ? new Date() : null,
      simulationExtractedJson:
        sim?.extractedJson != null ? (sim.extractedJson as object) : undefined,
      simMontoAGirar: simMontoAGirar,
      simDifPrecio: sim?.difPrecio ?? null,
      simComision: sim?.comision ?? null,
      simIva: sim?.iva ?? null,
      simGastosLegal: sim?.gastosLegal ?? null,
      simNotaria: sim?.notaria ?? null,
      simGastosOperacionales: sim?.gastosOperacionales ?? null,
      costoFinanciero: costoFinanciero,
      effectiveMonthlyRate: effectiveMonthlyRate,
      batchId: input.batchId ?? null,
    },
    select: { id: true, code: true, aecTrackId: true },
  });

  // Si la cesión es 100% (advanceRate === 100), el cobro pasa íntegro al
  // factoring → marcamos el DTE como CEDED para que los KPIs "Por cobrar"
  // y aging lo excluyan. Si es parcial (< 100), el DTE se queda en su
  // estado actual: aún tenemos que cobrar la retención al deudor.
  if (input.advanceRate >= 100) {
    await prisma.financeDte.update({
      where: { id: dte.id },
      data: { paymentStatus: "CEDED" },
    });
  }

  // Notificar al cesionario por email. Fire-and-forget: si falla el correo
  // no se aborta la operación ya persistida; el error queda en consola.
  sendCesionNotificacionEmail({
    tenantId: ctx.tenantId,
    operationCode: op.code,
    cesionarioRazonSocial: company.razonSocial,
    cesionarioEmail: company.email ?? null,
    cedenteRazonSocial: dteCfg.emisorRazonSocial ?? "",
    dteType: dte.dteType,
    dteFolio: dte.folio,
    montoCesion: rpetcAligned.montoCesion,
    fechaCesion: input.fechaCesion,
    fechaVencimiento: input.fechaVencimiento,
    trackId: op.aecTrackId ?? cedeResult.trackId,
    estadoSii: cedeResult.status ?? null,
  }).catch((err: unknown) => {
    console.error("[cession] Error enviando email al cesionario:", err);
  });

  return {
    operationId: op.id,
    code: op.code,
    trackId: op.aecTrackId ?? cedeResult.trackId ?? "",
  };
}

// ── Email al cesionario ───────────────────────────────────────────────────────

interface CesionEmailPayload {
  tenantId: string;
  operationCode: string;
  cesionarioRazonSocial: string;
  cesionarioEmail: string | null;
  cedenteRazonSocial: string;
  dteType: number;
  dteFolio: number;
  montoCesion: number;
  fechaCesion: string;
  fechaVencimiento: string;
  trackId?: string | null;
  estadoSii?: string | null;
}

async function sendCesionNotificacionEmail(p: CesionEmailPayload): Promise<void> {
  if (!p.cesionarioEmail) return;

  const { resend, getTenantEmailConfig } = await import("@/lib/resend");
  const { render } = await import("@react-email/render");
  const { CesionNotificacionEmail } = await import(
    "@/emails/CesionNotificacionEmail"
  );

  const emailCfg = await getTenantEmailConfig(p.tenantId);

  const montoCesionFmt = `$${Math.round(p.montoCesion).toLocaleString("es-CL")}`;
  const dteDesc = `Factura tipo ${p.dteType} / Folio ${p.dteFolio}`;
  const fechaCesionFmt = new Date(`${p.fechaCesion}T12:00:00Z`).toLocaleDateString(
    "es-CL",
    { day: "2-digit", month: "2-digit", year: "numeric" },
  );
  const fechaVencFmt = new Date(`${p.fechaVencimiento}T12:00:00Z`).toLocaleDateString(
    "es-CL",
    { day: "2-digit", month: "2-digit", year: "numeric" },
  );

  const html = await render(
    CesionNotificacionEmail({
      cesionarioRazonSocial: p.cesionarioRazonSocial,
      operationCode: p.operationCode,
      montoCesion: montoCesionFmt,
      fechaCesion: fechaCesionFmt,
      fechaVencimiento: fechaVencFmt,
      dteDescripcion: dteDesc,
      cedenteRazonSocial: p.cedenteRazonSocial,
      trackId: p.trackId ?? undefined,
      estadoSii: p.estadoSii ?? undefined,
      brandName: emailCfg.companyName,
      logoUrl: emailCfg.logoUrl,
      emailContacto: emailCfg.replyTo || emailCfg.from,
    }),
  );

  // BCC al `emailReplyTo` del tenant — mismo patrón que dte-email.service:
  // el equipo interno recibe copia oculta automática de cada notificación
  // de cesión al cesionario (factoring).
  const adminBcc = (emailCfg.replyTo ?? "").trim();
  const cesionarioLower = p.cesionarioEmail.toLowerCase();
  const bccList =
    adminBcc &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminBcc) &&
    adminBcc.toLowerCase() !== cesionarioLower
      ? [adminBcc]
      : undefined;

  await resend.emails.send({
    from: emailCfg.from,
    replyTo: emailCfg.replyTo || undefined,
    to: [p.cesionarioEmail],
    bcc: bccList,
    subject: `Cesión electrónica ${p.operationCode} — ${montoCesionFmt} registrada en SII`,
    html,
  });
}

// ════════════════════════════════════════════════════════════════
//  BULK CESIÓN — Fase 2
// ════════════════════════════════════════════════════════════════

export interface BulkCedeInput {
  /** IDs de los DTEs a ceder en este batch. Mínimo 2 (caso 1 usa cedeDte). */
  dteIds: string[];
  factoringCompanyId: string;
  fechaCesion: string; // YYYY-MM-DD
  fechaVencimiento: string; // YYYY-MM-DD
  advanceRate: number;
  interestRate: number;
  emailDeudor?: string;
  notes?: string;
  contactNombre?: string;
  contactFono?: string;
  contactEmail?: string;
  /** Totales del batch (vienen del PDF de simulación o tipeados a mano).
   *  El servidor prorratea estos totales entre las N facturas por
   *  monto bruto y persiste el share en cada FinanceFactoringOperation. */
  totals: {
    montoAGirar?: number | null;
    difPrecio?: number | null;
    comision?: number | null;
    iva?: number | null;
    gastosLegal?: number | null;
    notaria?: number | null;
    gastosOperacionales?: number | null;
  };
  simulation?: SimulationSnapshot;
}

export interface BulkCedeResult {
  batchId: string;
  batchCode: string;
  results: Array<{
    dteId: string;
    operationId?: string;
    code?: string;
    trackId?: string;
    error?: string;
  }>;
}

async function generateBatchCode(tenantId: string, date: Date): Promise<string> {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const datePrefix = `BATCH-${yyyy}${mm}${dd}`;
  const count = await prisma.financeFactoringBatch.count({
    where: { tenantId, code: { startsWith: datePrefix } },
  });
  return `${datePrefix}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Cede N DTEs bajo un mismo batch. Crea el batch primero con totales y
 * simulación, luego itera los DTEs llamando `cedeDte` para cada uno con
 * el `batchId` inyectado + comisión prorrateada por monto bruto.
 *
 * **Tolerancia a fallos parciales:** si un DTE individual falla, el
 * batch sigue con los siguientes. El caller recibe el detalle por DTE
 * en `results[]`. Si TODOS fallan, devuelve el batch igual (vacío) para
 * que el usuario pueda reintentar.
 *
 * SII no soporta cesión bulk nativa — cada DTE genera su propio AEC,
 * así que iteramos en serie (mismo certificado, evita rate-limit).
 */
export async function bulkCedeDtes(
  input: BulkCedeInput,
  ctx: CedeDteContext,
): Promise<BulkCedeResult> {
  if (input.dteIds.length < 2) {
    throw new Error("bulkCedeDtes requiere al menos 2 DTEs.");
  }

  // 1. Pre-cargar montos brutos de los DTEs para validación + prorrateo.
  const dteMontos = await prisma.financeDte.findMany({
    where: {
      id: { in: input.dteIds },
      tenantId: ctx.tenantId,
      direction: "ISSUED",
    },
    select: { id: true, totalAmount: true },
  });
  if (dteMontos.length !== input.dteIds.length) {
    throw new Error(
      `Sólo ${dteMontos.length} de ${input.dteIds.length} DTEs encontrados en este tenant.`,
    );
  }
  const totalBruto = dteMontos.reduce(
    (s, d) => s + Number(d.totalAmount),
    0,
  );
  if (totalBruto <= 0) {
    throw new Error("La suma de los DTEs es 0 o negativa — no se puede ceder.");
  }

  // 2. Métricas derivadas del batch.
  const cesion = new Date(`${input.fechaCesion}T00:00:00Z`);
  const venc = new Date(`${input.fechaVencimiento}T00:00:00Z`);
  const plazoDias = Math.max(
    1,
    Math.round((venc.getTime() - cesion.getTime()) / 86400000),
  );
  const t = input.totals;
  const totalCostoFinanciero =
    t.montoAGirar != null ? Math.max(0, totalBruto - t.montoAGirar) : null;
  const totalAdvance = round2(totalBruto * (input.advanceRate / 100));
  const effectiveMonthlyRate =
    totalCostoFinanciero != null && totalAdvance > 0 && plazoDias > 0
      ? Math.round(
          (totalCostoFinanciero / totalAdvance) *
            (30 / plazoDias) *
            100 *
            10000,
        ) / 10000
      : null;

  // 3. Crear batch.
  const code = await generateBatchCode(ctx.tenantId, new Date());
  const batch = await prisma.financeFactoringBatch.create({
    data: {
      tenantId: ctx.tenantId,
      code,
      factoringCompanyId: input.factoringCompanyId,
      simulationFileUrl: input.simulation?.fileUrl ?? null,
      simulationFileKey: input.simulation?.fileKey ?? null,
      simulationFileName: input.simulation?.fileName ?? null,
      simulationExtractedAt: input.simulation ? new Date() : null,
      simulationExtractedJson:
        input.simulation?.extractedJson != null
          ? (input.simulation.extractedJson as object)
          : undefined,
      fechaCesion: cesion,
      fechaVencimiento: venc,
      plazoDias,
      totalInvoiceAmount: totalBruto,
      totalMontoAGirar: t.montoAGirar ?? null,
      totalDifPrecio: t.difPrecio ?? null,
      totalComision: t.comision ?? null,
      totalIva: t.iva ?? null,
      totalGastosLegal: t.gastosLegal ?? null,
      totalNotaria: t.notaria ?? null,
      totalGastosOperacionales: t.gastosOperacionales ?? null,
      totalCostoFinanciero,
      effectiveMonthlyRate,
      notes: input.notes ?? null,
      createdBy: ctx.userId,
    },
    select: { id: true, code: true },
  });

  // 4. Iterar cada DTE en serie, prorrateando los totales por bruto.
  const results: BulkCedeResult["results"] = [];
  let successCount = 0;
  for (const dte of dteMontos) {
    const share = Number(dte.totalAmount) / totalBruto;
    const dteComision = t.comision != null ? round2(t.comision * share) : 0;
    const dteSim: SimulationSnapshot | undefined = input.simulation
      ? {
          fileUrl: input.simulation.fileUrl ?? null,
          fileKey: input.simulation.fileKey ?? null,
          fileName: input.simulation.fileName ?? null,
          extractedJson: input.simulation.extractedJson,
          // Cada operation guarda SU share, no el total del batch.
          montoBruto: Number(dte.totalAmount),
          montoAGirar:
            t.montoAGirar != null ? round2(t.montoAGirar * share) : null,
          difPrecio: t.difPrecio != null ? round2(t.difPrecio * share) : null,
          comision: dteComision,
          iva: t.iva != null ? round2(t.iva * share) : null,
          gastosLegal:
            t.gastosLegal != null ? round2(t.gastosLegal * share) : null,
          notaria: t.notaria != null ? round2(t.notaria * share) : null,
          gastosOperacionales:
            t.gastosOperacionales != null
              ? round2(t.gastosOperacionales * share)
              : null,
        }
      : undefined;

    try {
      const r = await cedeDte(
        {
          dteId: dte.id,
          factoringCompanyId: input.factoringCompanyId,
          fechaCesion: input.fechaCesion,
          fechaVencimiento: input.fechaVencimiento,
          advanceRate: input.advanceRate,
          interestRate: input.interestRate,
          commissionAmount: dteComision,
          emailDeudor: input.emailDeudor,
          notes: input.notes,
          contactNombre: input.contactNombre,
          contactFono: input.contactFono,
          contactEmail: input.contactEmail,
          simulation: dteSim,
          batchId: batch.id,
        },
        ctx,
      );
      results.push({
        dteId: dte.id,
        operationId: r.operationId,
        code: r.code,
        trackId: r.trackId,
      });
      successCount += 1;
    } catch (err) {
      results.push({
        dteId: dte.id,
        error: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  // 5. Actualizar count en el batch (para reporting).
  if (successCount > 0) {
    await prisma.financeFactoringBatch.update({
      where: { id: batch.id },
      data: { operationsCount: successCount },
    });
  }

  return { batchId: batch.id, batchCode: batch.code, results };
}
