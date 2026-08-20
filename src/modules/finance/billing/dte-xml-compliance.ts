/**
 * Cumplimiento de referencias y enrutamiento de email DTE.
 *
 * Varios receptores corporativos (p. ej. portales SAP / casillas
 * `recepciondte_*`) validan el XML con TpoDocRef numéricos SII (801, 802, 52)
 * y exigen que el XML+PDF llegue a la casilla de recepción DTE.
 *
 * Estas reglas son generales — no están hardcodeadas a un cliente — y no
 * cambian el XML ya emitido: solo afectan emisión nueva y el email de copia.
 */
import { prisma } from "@/lib/prisma";
import { normalizeEmailAddress, normalizeEmailList } from "@/lib/email-address";
import {
  filterUnlinkedDteRecipients,
  isDteReceptionEmail,
} from "./dte-recipient-guard";

export {
  filterUnlinkedDteRecipients,
  isDteReceptionEmail,
  isLinkedDteRecipient,
} from "./dte-recipient-guard";

export type AdditionalRef = {
  tipoDocRef: string;
  folioRef: string;
  fchRef: string;
  razonRef: string;
};

const MAX_CC = 10;

/**
 * Normaliza TpoDocRef alfanuméricos de UI al código SII que esperan
 * los validadores SAP/portales de recepción:
 *   - HES → 802 (Nota de pedido / recepción de servicio)
 *   - GD / GUIA → 52 (Guía de despacho)
 */
export function normalizeTipoDocRefForSii(tipoDocRef: string): {
  tipoDocRef: string;
  defaultRazonRef: string;
} {
  const raw = (tipoDocRef ?? "").trim();
  const upper = raw.toUpperCase();
  if (upper === "HES") {
    return { tipoDocRef: "802", defaultRazonRef: "HES" };
  }
  if (upper === "GD" || upper === "GUIA" || upper === "GUÍA") {
    return { tipoDocRef: "52", defaultRazonRef: "Guía de despacho" };
  }
  return { tipoDocRef: raw, defaultRazonRef: "" };
}

/**
 * Filas completas (folio + fecha) listas para el bloque <Referencia> del
 * XML SII. Deduplica por (tipoDocRef normalizado, folioRef).
 */
export function normalizeAdditionalReferencesForSii(
  refs: AdditionalRef[] | undefined | null,
): AdditionalRef[] {
  if (!refs?.length) return [];
  const out: AdditionalRef[] = [];
  const seen = new Set<string>();

  for (const r of refs) {
    const folio = (r.folioRef ?? "").trim();
    const fch = (r.fchRef ?? "").trim();
    if (!folio || !/^\d{4}-\d{2}-\d{2}$/.test(fch)) continue;

    const { tipoDocRef, defaultRazonRef } = normalizeTipoDocRefForSii(
      r.tipoDocRef,
    );
    if (!tipoDocRef) continue;

    const key = `${tipoDocRef.toUpperCase()}|${folio.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const razon = (r.razonRef ?? "").trim() || defaultRazonRef;
    out.push({
      tipoDocRef,
      folioRef: folio,
      fchRef: fch,
      razonRef: razon,
    });
  }

  return out;
}

export type ResolvedDteEmailRecipients = {
  to: string | null;
  cc: string[];
  /** true si movimos la casilla DTE a TO o agregamos emails de recepción/facturación. */
  adjusted: boolean;
};

/**
 * Asegura que la casilla DTE del cliente (y contactos con
 * `recibeFacturacion`) queden en los destinatarios del email PDF+XML.
 *
 * Si hay casilla DTE y el TO actual no es casilla, la casilla pasa a TO
 * y el TO previo a CC — así los buzones automáticos que solo miran TO
 * reciben el XML. Tope 10 CC (misma regla de la UI).
 */
export function resolveDteEmailRecipients(input: {
  currentTo?: string | null;
  currentCc?: string[] | null;
  /** Emails de contactos casilla DTE (recepciondte*, etc.). */
  receptionEmails?: string[] | null;
  /** Emails de contactos con recibeFacturacion. */
  billingEmails?: string[] | null;
}): ResolvedDteEmailRecipients {
  const reception = normalizeEmailList(input.receptionEmails ?? []);
  const billing = normalizeEmailList(input.billingEmails ?? []);
  let to = input.currentTo?.trim()
    ? normalizeEmailAddress(input.currentTo)
    : null;
  const ccSet = new Set(normalizeEmailList(input.currentCc ?? []));
  let adjusted = false;

  const ensureCc = (email: string) => {
    if (!email || (to && email === to) || ccSet.has(email)) return;
    if (ccSet.size >= MAX_CC) return;
    ccSet.add(email);
    adjusted = true;
  };

  // Preferir casilla DTE como TO (buzones automáticos suelen ignorar CC).
  if (reception.length > 0) {
    const primaryReception = reception[0]!;
    if (!to) {
      to = primaryReception;
      adjusted = true;
    } else if (!isDteReceptionEmail(to) && to !== primaryReception) {
      const previousTo = to;
      // Liberar un slot si CC está lleno: la casilla no debe quedar fuera.
      if (ccSet.size >= MAX_CC) {
        const drop = [...ccSet].find((e) => e !== previousTo);
        if (drop) ccSet.delete(drop);
      }
      to = primaryReception;
      ccSet.delete(primaryReception);
      if (previousTo && previousTo !== to) {
        ccSet.add(previousTo);
      }
      adjusted = true;
    }
    for (const e of reception) ensureCc(e);
  }

  for (const e of billing) ensureCc(e);

  const cc = [...ccSet].filter((e) => e !== to).slice(0, MAX_CC);
  return { to, cc, adjusted };
}

/**
 * Carga contactos CRM del account y resuelve TO/CC para emisión/envío DTE.
 * Sin crmAccountId → devuelve los valores actuales sin tocar.
 */
function blankToUndefined(value?: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type ReceiverSiiFields = {
  giro?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
};

/**
 * Completa Giro/Dirección/Comuna/Ciudad del receptor desde la ficha CRM
 * cuando el caller no los mandó. El SII los exige en facturas (33/34);
 * si quedan vacíos el provider escribe defaults ("Sin Giro") en el XML.
 *
 * No pisa valores ya presentes. Giro formal (`account.giro`) manda;
 * si falta, cae a `industry` (misma regla que DteForm).
 */
export async function enrichDteReceiverFromCrm(input: {
  tenantId: string;
  crmAccountId?: string | null;
  current?: ReceiverSiiFields | null;
}): Promise<ReceiverSiiFields & { adjusted: boolean }> {
  const current: ReceiverSiiFields = {
    giro: blankToUndefined(input.current?.giro),
    direccion: blankToUndefined(input.current?.direccion),
    comuna: blankToUndefined(input.current?.comuna),
    ciudad: blankToUndefined(input.current?.ciudad),
  };

  if (!input.crmAccountId) {
    return { ...current, adjusted: false };
  }

  const missing =
    !current.giro || !current.direccion || !current.comuna || !current.ciudad;
  if (!missing) {
    return { ...current, adjusted: false };
  }

  const account = await prisma.crmAccount.findFirst({
    where: { id: input.crmAccountId, tenantId: input.tenantId },
    select: {
      giro: true,
      industry: true,
      address: true,
      commune: true,
      city: true,
    },
  });
  if (!account) {
    return { ...current, adjusted: false };
  }

  const giroFromCrm =
    blankToUndefined(account.giro) ?? blankToUndefined(account.industry);
  const next: ReceiverSiiFields = {
    giro: current.giro ?? giroFromCrm,
    direccion: current.direccion ?? blankToUndefined(account.address),
    comuna: current.comuna ?? blankToUndefined(account.commune),
    ciudad: current.ciudad ?? blankToUndefined(account.city),
  };
  const adjusted =
    next.giro !== current.giro ||
    next.direccion !== current.direccion ||
    next.comuna !== current.comuna ||
    next.ciudad !== current.ciudad;
  return { ...next, adjusted };
}

export async function enrichDteEmailRecipientsFromCrm(input: {
  tenantId: string;
  crmAccountId?: string | null;
  currentTo?: string | null;
  currentCc?: string[] | null;
  /**
   * Default true: descarta TO/CC que no son contacto de la cuenta ni
   * casilla DTE. El auto-envío SIEMPRE filtra. El reenvío manual pasa
   * `explicitEmails` con lo que el usuario tipeó en el modal.
   */
  dropUnlinked?: boolean;
  /** Emails del override manual; no se descartan aunque no sean contacto. */
  explicitEmails?: string[] | null;
}): Promise<ResolvedDteEmailRecipients> {
  const dropUnlinked = input.dropUnlinked !== false;
  const base = resolveDteEmailRecipients({
    currentTo: input.currentTo,
    currentCc: input.currentCc,
    receptionEmails: [],
    billingEmails: [],
  });

  if (!input.crmAccountId) {
    return { ...base, adjusted: false };
  }

  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId: input.tenantId,
      accountId: input.crmAccountId,
      email: { not: null },
    },
    select: {
      email: true,
      recibeFacturacion: true,
    },
  });

  const accountEmails: string[] = [];
  const receptionEmails: string[] = [];
  const billingEmails: string[] = [];
  for (const c of contacts) {
    if (!c.email) continue;
    const email = normalizeEmailAddress(c.email);
    if (!email.includes("@")) continue;
    accountEmails.push(email);
    if (isDteReceptionEmail(email)) receptionEmails.push(email);
    else if (c.recibeFacturacion) billingEmails.push(email);
  }

  const routed = resolveDteEmailRecipients({
    currentTo: input.currentTo,
    currentCc: input.currentCc,
    receptionEmails,
    billingEmails,
  });

  if (!dropUnlinked) {
    return routed;
  }

  const filtered = filterUnlinkedDteRecipients({
    to: routed.to,
    cc: routed.cc,
    accountEmails,
    explicitEmails: input.explicitEmails,
  });

  return {
    to: filtered.to,
    cc: filtered.cc,
    adjusted: routed.adjusted || filtered.adjusted,
  };
}
