/**
 * Token Resolver — Resuelve tokens con datos reales de las entidades CRM/CPQ/Guardia
 *
 * Recibe un mapeo de entityType → entityData y resuelve los tokens
 * dentro del contenido Tiptap JSON.
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CAUSALES_DT } from "@/lib/guard-events";

export interface EntityData {
  account?: Record<string, any> | null;
  contact?: Record<string, any> | null;
  installation?: Record<string, any> | null;
  deal?: Record<string, any> | null;
  quote?: Record<string, any> | null;
  guardia?: Record<string, any> | null;
  labor_event?: Record<string, any> | null;
}

/**
 * Resolve a single token key to its value given entity data.
 */
export function resolveTokenValue(
  tokenKey: string,
  entities: EntityData
): string {
  const [module, field] = tokenKey.split(".");
  if (!module || !field) return `{{${tokenKey}}}`;

  // System tokens
  if (module === "system") {
    const now = new Date();
    switch (field) {
      case "today":
        return format(now, "dd/MM/yyyy");
      case "todayLong":
        return format(now, "d 'de' MMMM 'de' yyyy", { locale: es });
      case "year":
        return now.getFullYear().toString();
      case "month":
        return format(now, "MMMM", { locale: es });
      default:
        return `{{${tokenKey}}}`;
    }
  }

  // Entity tokens
  const entity = entities[module as keyof EntityData];
  if (!entity) return `{{${tokenKey}}}`;

  // Special computed fields
  if (module === "contact" && field === "fullName") {
    const first = entity.firstName || "";
    const last = entity.lastName || "";
    return `${first} ${last}`.trim() || `{{${tokenKey}}}`;
  }

  if (module === "guardia" && field === "fullName") {
    const first = entity.firstName || "";
    const last = entity.lastName || "";
    return `${first} ${last}`.trim() || `{{${tokenKey}}}`;
  }

  if (module === "guardia" && field === "contractType") {
    const type = entity.contractType;
    if (type === "plazo_fijo") return "Plazo Fijo";
    if (type === "indefinido") return "Indefinido";
    return type || `{{${tokenKey}}}`;
  }

  if (module === "labor_event" && field === "causalDtArticle") {
    const code = entity.causalDtCode;
    if (!code) return `{{${tokenKey}}}`;
    const causal = CAUSALES_DT.find((c) => c.code === code);
    return causal ? `${causal.article} ${causal.number}` : `{{${tokenKey}}}`;
  }

  const value = entity[field];
  if (value === null || value === undefined) return `{{${tokenKey}}}`;

  // Format based on type
  if (value instanceof Date) {
    return format(value, "dd/MM/yyyy");
  }

  if (typeof value === "number") {
    return value.toLocaleString("es-CL");
  }

  // Currency formatting for settlement amounts
  if (
    module === "labor_event" &&
    [
      "vacationPaymentAmount",
      "pendingRemunerationAmount",
      "yearsOfServiceAmount",
      "substituteNoticeAmount",
      "totalSettlementAmount",
    ].includes(field)
  ) {
    const num = Number(value);
    if (!isNaN(num)) return `$${num.toLocaleString("es-CL")}`;
  }

  return String(value);
}

/**
 * Resolve all tokens in a Tiptap JSON document.
 * Returns the resolved document and a map of token → resolved value.
 */
export function resolveDocument(
  content: any,
  entities: EntityData
): { resolvedContent: any; tokenValues: Record<string, string> } {
  const tokenValues: Record<string, string> = {};

  function walkNode(node: any): any {
    if (!node) return node;

    // If this is a contractToken node, resolve it
    if (node.type === "contractToken" && node.attrs?.tokenKey) {
      const tokenKey = node.attrs.tokenKey;
      const value = resolveTokenValue(tokenKey, entities);
      tokenValues[tokenKey] = value;

      // Replace the token node with a text node containing the resolved value
      return {
        type: "text",
        text: value,
        marks: node.attrs.resolvedMarks || [{ type: "bold" }],
      };
    }

    // Recurse into content
    if (node.content && Array.isArray(node.content)) {
      return {
        ...node,
        content: node.content.map(walkNode),
      };
    }

    return node;
  }

  const resolvedContent = walkNode(content);
  return { resolvedContent, tokenValues };
}

/**
 * Extract all token keys used in a Tiptap JSON document.
 */
export function extractTokenKeys(content: any): string[] {
  const keys: Set<string> = new Set();

  function walkNode(node: any): void {
    if (!node) return;

    if (node.type === "contractToken" && node.attrs?.tokenKey) {
      keys.add(node.attrs.tokenKey);
    }

    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(walkNode);
    }
  }

  walkNode(content);
  return Array.from(keys);
}

/**
 * Convierte un documento Tiptap JSON a texto plano (para WhatsApp, etc.).
 */
export function tiptapToPlainText(doc: any): string {
  if (!doc) return "";
  const parts: string[] = [];
  function walk(node: any) {
    if (!node) return;
    if (node.type === "text" && node.text != null) {
      parts.push(node.text);
      return;
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(walk);
      if (node.type === "paragraph" || node.type === "heading") parts.push("\n");
    }
    if (node.type === "hardBreak") parts.push("\n");
  }
  walk(doc);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Build entity data for a guardia from raw DB records.
 */
export function buildGuardiaEntityData(guardia: {
  persona: Record<string, any>;
  currentInstallation?: { name: string } | null;
  bankAccounts?: Array<Record<string, any>>;
  contractType?: string | null;
  contractStartDate?: string | Date | null;
  contractPeriod1End?: string | Date | null;
  contractPeriod2End?: string | Date | null;
  contractPeriod3End?: string | Date | null;
  contractCurrentPeriod?: number | null;
  hiredAt?: string | Date | null;
  code?: string | null;
}): Record<string, any> {
  const persona = guardia.persona;
  const bank = guardia.bankAccounts?.[0];
  const period = guardia.contractCurrentPeriod ?? 1;
  let contractEndDate = guardia.contractPeriod1End;
  if (period === 2) contractEndDate = guardia.contractPeriod2End;
  if (period === 3) contractEndDate = guardia.contractPeriod3End;

  return {
    firstName: persona.firstName,
    lastName: persona.lastName,
    fullName: `${persona.firstName} ${persona.lastName}`.trim(),
    rut: persona.rut,
    email: persona.email,
    phone: persona.phone || persona.phoneMobile,
    address: persona.addressFormatted || persona.addressLine1,
    commune: persona.commune,
    city: persona.city,
    region: persona.region,
    birthDate: persona.birthDate ? format(new Date(persona.birthDate as string), "dd/MM/yyyy") : null,
    afp: persona.afp,
    healthSystem: persona.healthSystem,
    isapreName: persona.isapreName,
    hiredAt: guardia.hiredAt ? format(new Date(guardia.hiredAt as string), "dd/MM/yyyy") : null,
    code: guardia.code,
    currentInstallation: guardia.currentInstallation?.name ?? null,
    contractType: guardia.contractType,
    contractStartDate: guardia.contractStartDate ? format(new Date(guardia.contractStartDate as string), "dd/MM/yyyy") : null,
    contractEndDate: contractEndDate ? format(new Date(contractEndDate as string), "dd/MM/yyyy") : null,
    contractPeriod1End: guardia.contractPeriod1End ? format(new Date(guardia.contractPeriod1End as string), "dd/MM/yyyy") : null,
    contractPeriod2End: guardia.contractPeriod2End ? format(new Date(guardia.contractPeriod2End as string), "dd/MM/yyyy") : null,
    contractPeriod3End: guardia.contractPeriod3End ? format(new Date(guardia.contractPeriod3End as string), "dd/MM/yyyy") : null,
    contractCurrentPeriod: period,
    bankName: bank?.bankName ?? null,
    bankAccountNumber: bank?.accountNumber ?? null,
    bankAccountType: bank?.accountType ?? null,
  };
}

/**
 * Build entity data for a labor event (finiquito).
 */
export function buildLaborEventEntityData(event: Record<string, any>): Record<string, any> {
  const causal = CAUSALES_DT.find((c) => c.code === event.causalDtCode);
  return {
    category: event.category,
    subtype: event.subtype,
    finiquitoDate: event.finiquitoDate ? format(new Date(event.finiquitoDate), "dd/MM/yyyy") : null,
    causalDtCode: event.causalDtCode,
    causalDtLabel: event.causalDtLabel,
    causalDtArticle: causal ? `${causal.article} ${causal.number}` : null,
    vacationDaysPending: event.vacationDaysPending,
    vacationPaymentAmount: event.vacationPaymentAmount ? Number(event.vacationPaymentAmount) : null,
    pendingRemunerationAmount: event.pendingRemunerationAmount ? Number(event.pendingRemunerationAmount) : null,
    yearsOfServiceAmount: event.yearsOfServiceAmount ? Number(event.yearsOfServiceAmount) : null,
    substituteNoticeAmount: event.substituteNoticeAmount ? Number(event.substituteNoticeAmount) : null,
    totalSettlementAmount: event.totalSettlementAmount ? Number(event.totalSettlementAmount) : null,
    reason: event.reason,
  };
}
