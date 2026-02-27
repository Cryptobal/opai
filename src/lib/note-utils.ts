/**
 * Unified Notes — shared helpers.
 *
 * Context type mapping, deep-link generation, mention resolution
 * (re-uses existing crm-note-utils for @mention parsing).
 */

import type { NoteContextType } from "@prisma/client";

// ── Valid context types (mirrors Prisma enum) ──

export const VALID_CONTEXT_TYPES: NoteContextType[] = [
  "LEAD",
  "ACCOUNT",
  "INSTALLATION",
  "DEAL",
  "CONTACT",
  "QUOTATION",
  "GUARD",
  "DOCUMENT",
  "SHIFT",
  "REINFORCEMENT_SHIFT",
  "PAYROLL_RECORD",
  "INVOICE",
  "OPERATION",
  "SUPPLIER",
  "TICKET",
  "RENDICION",
  "PUESTO",
  "PAUTA_MENSUAL",
  "SUPERVISION_VISIT",
];

export function isValidContextType(value: string): value is NoteContextType {
  return VALID_CONTEXT_TYPES.includes(value as NoteContextType);
}

// ── Deep link builders per context type ──

const CONTEXT_LINKS: Record<NoteContextType, (id: string) => string> = {
  LEAD: (id) => `/crm/leads/${id}`,
  ACCOUNT: (id) => `/crm/accounts/${id}`,
  INSTALLATION: (id) => `/crm/installations/${id}`,
  DEAL: (id) => `/crm/deals/${id}`,
  CONTACT: (id) => `/crm/contacts/${id}`,
  QUOTATION: (id) => `/crm/cotizaciones/${id}`,
  GUARD: (id) => `/personas/guardias/${id}`,
  DOCUMENT: (id) => `/opai/documentos/${id}`,
  SHIFT: (id) => `/ops/turnos-extra?id=${id}`,
  REINFORCEMENT_SHIFT: (id) => `/ops/refuerzos?id=${id}`,
  PAYROLL_RECORD: (id) => `/payroll/periodos/${id}`,
  INVOICE: (id) => `/finanzas/facturacion?id=${id}`,
  OPERATION: (id) => `/ops/control-nocturno/${id}`,
  SUPPLIER: (id) => `/finanzas/proveedores?id=${id}`,
  TICKET: (id) => `/ops/tickets/${id}`,
  RENDICION: (id) => `/finanzas/rendiciones/${id}`,
  PUESTO: (id) => `/ops/puestos?id=${id}`,
  PAUTA_MENSUAL: (id) => `/ops/pauta-mensual?installationId=${id}`,
  SUPERVISION_VISIT: (id) => `/ops/supervision/${id}`,
};

export function buildNoteContextLink(
  contextType: NoteContextType,
  contextId: string,
): string {
  const builder = CONTEXT_LINKS[contextType];
  return builder ? builder(contextId) : "#";
}

// ── Module mapping for context types (for permission checks) ──

const CONTEXT_MODULE: Record<NoteContextType, string> = {
  LEAD: "crm",
  ACCOUNT: "crm",
  INSTALLATION: "crm",
  DEAL: "crm",
  CONTACT: "crm",
  QUOTATION: "cpq",
  GUARD: "ops",
  DOCUMENT: "docs",
  SHIFT: "ops",
  REINFORCEMENT_SHIFT: "ops",
  PAYROLL_RECORD: "payroll",
  INVOICE: "finance",
  OPERATION: "ops",
  SUPPLIER: "finance",
  TICKET: "ops",
  RENDICION: "finance",
  PUESTO: "ops",
  PAUTA_MENSUAL: "ops",
  SUPERVISION_VISIT: "ops",
};

export function getContextModule(contextType: NoteContextType): string {
  return CONTEXT_MODULE[contextType] ?? "crm";
}

// ── Friendly labels per context type ──

export const CONTEXT_LABELS: Record<NoteContextType, string> = {
  LEAD: "Lead",
  ACCOUNT: "Cuenta",
  INSTALLATION: "Instalación",
  DEAL: "Negocio",
  CONTACT: "Contacto",
  QUOTATION: "Cotización",
  GUARD: "Guardia",
  DOCUMENT: "Documento",
  SHIFT: "Turno Extra",
  REINFORCEMENT_SHIFT: "Refuerzo",
  PAYROLL_RECORD: "Liquidación",
  INVOICE: "Factura",
  OPERATION: "Control Nocturno",
  SUPPLIER: "Proveedor",
  TICKET: "Ticket",
  RENDICION: "Rendición",
  PUESTO: "Puesto",
  PAUTA_MENSUAL: "Pauta Mensual",
  SUPERVISION_VISIT: "Visita Supervisión",
};

// ── Entity reference pattern parsing (#Entity:id, /Entity/label) ──

/**
 * Extracts entity references from note content.
 * Patterns:
 *   #ACCOUNT:uuid        → { type: ACCOUNT, id: uuid }
 *   #QUOTATION:uuid      → { type: QUOTATION, id: uuid }
 */
export function extractEntityReferences(
  content: string,
): Array<{ type: NoteContextType; id: string }> {
  const refs: Array<{ type: NoteContextType; id: string }> = [];
  const pattern = /#([A-Z_]+):([a-f0-9-]+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const type = match[1] as NoteContextType;
    const id = match[2];
    if (isValidContextType(type) && id) {
      refs.push({ type, id });
    }
  }
  return refs;
}
