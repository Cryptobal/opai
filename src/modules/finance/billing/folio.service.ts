/**
 * Folio Service
 *
 * Calcula el estado real de folios por tipo de DTE combinando:
 *   - `TenantDteCaf` (rango autorizado por el SII)
 *   - `TenantDteFolioTracker` (siguiente folio reservado / nextFolio)
 *   - `FinanceDte` (folios efectivamente emitidos)
 *
 * En Chile los CAFs son válidos 6 meses desde `fechaAutorizacion`, por lo
 * que `cafExpiraEn` = `fechaAutorizacion + 6 meses`.
 *
 * Stock se considera "bajo" si quedan menos de LOW_STOCK_THRESHOLD folios
 * en el CAF activo.
 */

import { prisma } from "@/lib/prisma";

export const LOW_STOCK_THRESHOLD = 50;
export const CAF_VALIDITY_MONTHS = 6;

export interface FolioStatus {
  dteType: number;
  /** ID del CAF activo (null si nunca subió un CAF para este tipo). */
  cafId: string | null;
  folioDesde: number | null;
  folioHasta: number | null;
  /** Siguiente folio a usar — del tracker, o folioDesde si no hay tracker. */
  nextFolio: number;
  /** Folios consumidos del CAF activo (max 0 si nextFolio < folioDesde). */
  consumidos: number;
  /** Folios disponibles en el CAF activo (folioHasta - nextFolio + 1). */
  disponibles: number;
  /** Tamaño total del rango CAF activo. */
  totalCAF: number;
  /** % usado del CAF activo (0-100). */
  porcentajeUsado: number;
  /** True si disponibles < LOW_STOCK_THRESHOLD. */
  lowStock: boolean;
  /** Fecha estimada de expiración del CAF activo (autorización + 6 meses). */
  cafExpiraEn: Date | null;
  /** Último folio efectivamente emitido (de FinanceDte). */
  ultimoFolio: number;
  /** Total de DTEs emitidos para este tipo (histórico). */
  totalEmitidos: number;
  // ── Compat con UI legacy ──
  /** Alias de `ultimoFolio` (para tabla actual). */
  lastFolio: number;
  /** Alias de `totalEmitidos` (para tabla actual). */
  totalIssued: number;
}

/**
 * Tipos DTE que se reportan. Incluye notas (56/61) además de las
 * facturas/boletas para que la pestaña Folios cubra todo el catálogo SII
 * que el tenant pueda usar.
 */
const DTE_TYPES = [33, 34, 39, 41, 43, 46, 52, 56, 61];

function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() + months);
  return out;
}

/**
 * Devuelve el estado de folios para todos los tipos DTE relevantes.
 * Filtra los tipos sin CAF cargado y sin emisiones (no aporta info útil).
 */
export async function getFolioStatus(tenantId: string): Promise<FolioStatus[]> {
  const results = await Promise.all(
    DTE_TYPES.map(async (dteType): Promise<FolioStatus> => {
      const [tracker, activeCaf, lastDte, totalCount] = await Promise.all([
        prisma.tenantDteFolioTracker.findUnique({
          where: { tenantId_dteType: { tenantId, dteType } },
        }),
        prisma.tenantDteCaf.findFirst({
          where: { tenantId, dteType, isActive: true },
          orderBy: { folioDesde: "desc" },
          select: {
            id: true,
            folioDesde: true,
            folioHasta: true,
            fechaAutorizacion: true,
          },
        }),
        prisma.financeDte.findFirst({
          where: { tenantId, direction: "ISSUED", dteType },
          orderBy: { folio: "desc" },
          select: { folio: true },
        }),
        prisma.financeDte.count({
          where: { tenantId, direction: "ISSUED", dteType },
        }),
      ]);

      const folioDesde = activeCaf?.folioDesde ?? null;
      const folioHasta = activeCaf?.folioHasta ?? null;
      const nextFolio = tracker?.nextFolio ?? folioDesde ?? 1;
      const consumidos = folioDesde ? Math.max(0, nextFolio - folioDesde) : 0;
      const totalCAF =
        folioDesde !== null && folioHasta !== null
          ? folioHasta - folioDesde + 1
          : 0;
      const disponibles = folioHasta !== null
        ? Math.max(0, folioHasta - nextFolio + 1)
        : 0;
      const porcentajeUsado =
        totalCAF > 0 ? Math.round((consumidos / totalCAF) * 100) : 0;
      const lowStock = totalCAF > 0 && disponibles < LOW_STOCK_THRESHOLD;
      const cafExpiraEn = activeCaf?.fechaAutorizacion
        ? addMonths(activeCaf.fechaAutorizacion, CAF_VALIDITY_MONTHS)
        : null;
      const ultimoFolio = lastDte?.folio ?? 0;

      return {
        dteType,
        cafId: activeCaf?.id ?? null,
        folioDesde,
        folioHasta,
        nextFolio,
        consumidos,
        disponibles,
        totalCAF,
        porcentajeUsado,
        lowStock,
        cafExpiraEn,
        ultimoFolio,
        totalEmitidos: totalCount,
        lastFolio: ultimoFolio,
        totalIssued: totalCount,
      };
    }),
  );

  return results.filter((r) => r.totalCAF > 0 || r.totalEmitidos > 0);
}
