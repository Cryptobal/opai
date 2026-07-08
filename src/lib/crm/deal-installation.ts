/**
 * Instalación DE ESTE NEGOCIO (no de la cuenta) — fuente única.
 *
 * `CrmDeal` no modela `installationId`; la instalación real del negocio la
 * define la COTIZACIÓN ACTIVA (`deal.activeQuotationId → cpqQuote.installationId`),
 * que es lo que ya usa el canvas de Slack. Este helper unifica esa resolución
 * para que la UI del deal, la ficha viva y la adjudicación deriven de la misma
 * fuente en vez de tomar `accountInstallations[0]` a ciegas.
 *
 * Toda query filtra por `tenantId`. Nunca lanza: ante error retorna `null`.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { buildDealMapsUrl, formatDealAddress } from "@/lib/google-maps-url";

export interface DealInstallationRef {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
  status: "prospect" | "active" | "inactive";
  mapsUrl: string | null;
  addressText: string | null;
  /**
   * - `active_quote`: derivada de la cotización activa (canónica).
   * - `account_fallback`: el deal no tiene cotización activa y la cuenta tiene
   *   EXACTAMENTE una instalación → se usa sin ambigüedad.
   * - `none`: no hay forma segura de resolverla (0 o >1 instalaciones sin
   *   cotización activa). La UI muestra "sin instalación asignada".
   */
  source: "active_quote" | "account_fallback" | "none";
}

type InstallationRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
};

const INSTALLATION_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  commune: true,
  lat: true,
  lng: true,
  status: true,
} as const;

function normalizeStatus(status: string): DealInstallationRef["status"] {
  return status === "active" || status === "inactive" ? status : "prospect";
}

function toRef(row: InstallationRow, source: DealInstallationRef["source"]): DealInstallationRef {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    commune: row.commune,
    lat: row.lat,
    lng: row.lng,
    status: normalizeStatus(row.status),
    mapsUrl: buildDealMapsUrl({
      lat: row.lat,
      lng: row.lng,
      address: row.address,
      commune: row.commune,
      city: row.city,
    }),
    addressText: formatDealAddress({
      address: row.address,
      commune: row.commune,
      city: row.city,
    }),
    source,
  };
}

/**
 * Resuelve la instalación de este negocio.
 * Prioridad:
 *   1. `deal.activeQuotationId → cpqQuote.installationId` (fuente canónica).
 *   2. Si el deal no tiene cotización activa (o esta no apunta a una instalación)
 *      y la cuenta tiene EXACTAMENTE una instalación, úsala (`account_fallback`).
 *   3. Si no, `source: "none"` (NO se adivina la `[0]`).
 */
export async function resolveDealInstallation(
  tenantId: string,
  dealId: string
): Promise<DealInstallationRef | null> {
  try {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId },
      select: { accountId: true, activeQuotationId: true },
    });
    if (!deal) return null;

    // 1) Instalación de la cotización activa (canónica).
    if (deal.activeQuotationId) {
      const quote = await prisma.cpqQuote
        .findFirst({
          where: { id: deal.activeQuotationId, tenantId },
          select: { installation: { select: INSTALLATION_SELECT } },
        })
        .catch(() => null);
      if (quote?.installation) return toRef(quote.installation, "active_quote");
    }

    // 2) Fallback seguro: cuenta con exactamente una instalación.
    if (deal.accountId) {
      const installations = await prisma.crmInstallation.findMany({
        where: { tenantId, accountId: deal.accountId },
        orderBy: { createdAt: "desc" },
        select: INSTALLATION_SELECT,
        take: 2,
      });
      if (installations.length === 1) return toRef(installations[0], "account_fallback");
    }

    // 3) Ambiguo (0 o >1 sin cotización activa que resuelva) → no adivinar.
    return { ...EMPTY_REF };
  } catch {
    return null;
  }
}

const EMPTY_REF: DealInstallationRef = {
  id: "",
  name: "",
  address: null,
  city: null,
  commune: null,
  lat: null,
  lng: null,
  status: "prospect",
  mapsUrl: null,
  addressText: null,
  source: "none",
};
