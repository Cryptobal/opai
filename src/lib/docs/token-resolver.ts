/**
 * Token Resolver — Resuelve tokens con datos reales de las entidades CRM/CPQ/Guardia
 *
 * Recibe un mapeo de entityType → entityData y resuelve los tokens
 * dentro del contenido Tiptap JSON.
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CAUSALES_DT } from "@/lib/guard-events";

/** Formatea fechas tipo YYYY-MM-DD como dd/MM/yyyy sin desfase por zona horaria.
 *  new Date("2026-02-01") = medianoche UTC → en Chile muestra 31/01. Esta función evita eso. */
function formatDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const str = typeof value === "string" ? value : value.toISOString();
  const m = str.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return format(new Date(value as string), "dd/MM/yyyy");
  const [, y, mo, d] = m;
  return format(new Date(Number(y), Number(mo) - 1, Number(d)), "dd/MM/yyyy");
}
import { getRegimenPrevisionalLabel } from "@/lib/personas";

export interface EntityData {
  empresa?: Record<string, any> | null;
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
  if (value === null || value === undefined) return "";

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

  // Currency formatting for guardia salary (incl. bonos dinámicos guardia.bono_{code})
  if (
    module === "guardia" &&
    (["baseSalary", "colacion", "movilizacion", "bonosTotal"].includes(field) ||
      field.startsWith("bono_"))
  ) {
    const num = Number(value);
    if (!isNaN(num)) return `$${num.toLocaleString("es-CL")}`;
  }

  return String(value);
}

/** Reemplaza {{key}}, @EMPL_TERMINO_CONTRATO y {{#if}}...{{/if}} en texto plano */
function resolveMustacheInText(text: string, entities: EntityData): string {
  if (!text || typeof text !== "string") return text;
  let out = text;

  // @EMPL_TERMINO_CONTRATO → guardia.contractEndDate
  out = out.replace(/@EMPL_TERMINO_CONTRATO/g, () =>
    resolveTokenValue("guardia.contractEndDate", entities)
  );

  // {{#if expr}}...{{else}}...{{/if}} (con else opcional)
  out = out.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, expr, contentTrue, contentFalse) => {
    const conditionMet = evaluateCondition(expr.trim(), entities);
    return conditionMet ? resolveMustacheInText(contentTrue, entities) : resolveMustacheInText(contentFalse, entities);
  });
  // {{#if expr}}...{{/if}} (sin else)
  out = out.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, expr, content) => {
    const conditionMet = evaluateCondition(expr.trim(), entities);
    return conditionMet ? resolveMustacheInText(content, entities) : "";
  });

  // {{key}} simple
  out = out.replace(/\{\{([^}#]+)\}\}/g, (_, key) => {
    const k = String(key).trim();
    return resolveTokenValue(k, entities);
  });

  return out;
}

/** Evalúa expresiones tipo guardia.bono_X>0, guardia.colacion>0, guardia.isJubilado=="SI", guardia.healthSystem=="isapre" */
function evaluateCondition(expr: string, entities: EntityData): boolean {
  const t = expr.trim();
  // guardia.field>0
  const m1 = /^guardia\.(\w+)>0$/.exec(t);
  if (m1) {
    const entity = entities.guardia;
    if (!entity) return false;
    const val = entity[m1[1]];
    const num = Number(val);
    return !isNaN(num) && num > 0;
  }
  // guardia.field=="value" (ej: isJubilado=="SI", healthSystem=="isapre")
  const m2 = /^guardia\.(\w+)=="([^"]*)"$/.exec(t);
  if (m2) {
    const entity = entities.guardia;
    if (!entity) return false;
    const val = String(entity[m2[1]] ?? "").toLowerCase();
    const expected = m2[2].toLowerCase();
    return val === expected;
  }
  // guardia.field (truthy: existe y no vacío)
  const m3 = /^guardia\.(\w+)$/.exec(t);
  if (m3) {
    const entity = entities.guardia;
    if (!entity) return false;
    const val = entity[m3[1]];
    return val != null && val !== "" && val !== false;
  }
  return false;
}

/** Extrae texto plano de un nodo (para detectar {{#if}} y {{/if}}) */
function getNodeText(node: any): string {
  if (!node) return "";
  if (node.type === "text" && node.text != null) return String(node.text);
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(getNodeText).join("");
  }
  return "";
}

/** Serializa contenido inline a string, resolviendo contractTokens (para unificar {{#if}} que cruzan nodos) */
function serializeInlineToString(nodes: any[], entities: EntityData): string {
  return (nodes || []).map((n: any) => {
    if (n.type === "text" && n.text != null) return String(n.text);
    if (n.type === "contractToken" && n.attrs?.tokenKey) {
      return resolveTokenValue(n.attrs.tokenKey, entities);
    }
    if (n.type === "hardBreak") return "\n";
    return "";
  }).join("");
}

/** Procesa bloques {{#if expr}}...{{/if}} a nivel de hijos del doc */
function processConditionalBlocks(
  nodes: any[],
  entities: EntityData,
  walkNode: (n: any) => any
): any[] {
  const result: any[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    const text = getNodeText(node).trim();

    // Solo coincidir cuando el nodo es EXACTAMENTE {{#if expr}} (nada más) — evita tragar párrafos con {{#if}}...{{/if}} inline
    const ifMatch = /^\{\{#if\s+([^}]+)\}\}$/.exec(text);
    if (ifMatch) {
      const condition = ifMatch[1].trim();
      const conditionMet = evaluateCondition(condition, entities);
      i++;
      const block: any[] = [];
      let depth = 1;
      while (i < nodes.length) {
        const n = nodes[i];
        const t = getNodeText(n).trim();
        if (/^\{\{#if\s+[^}]+\}\}$/.test(t)) {
          depth++;
          block.push(n);
          i++;
        } else if (/^\{\{\/if\}\}$/.test(t)) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
          block.push(n);
          i++;
        } else {
          block.push(n);
          i++;
        }
      }
      if (conditionMet) {
        result.push(...processConditionalBlocks(block, entities, walkNode).map(walkNode));
      }
      continue;
    }

    if (/^\{\{\/if\}\}$/.test(text)) {
      i++;
      continue;
    }

    result.push(walkNode(node));
    i++;
  }
  return result;
}

/**
 * Resolve all tokens in a Tiptap JSON document.
 * - contractToken nodes → text
 * - {{key}} en texto → valor
 * - {{#if expr}}...{{/if}} → incluye/excluye según condición
 */
export function resolveDocument(
  content: any,
  entities: EntityData
): { resolvedContent: any; tokenValues: Record<string, string> } {
  const tokenValues: Record<string, string> = {};

  function walkNode(node: any): any {
    if (!node) return node;

    if (node.type === "contractToken" && node.attrs?.tokenKey) {
      const tokenKey = node.attrs.tokenKey;
      // No resolver tokens de firma aquí: se resuelven en signed-pdf con datos reales del firmante
      if (tokenKey.startsWith("signature.")) return node;
      const value = resolveTokenValue(tokenKey, entities);
      tokenValues[tokenKey] = value;
      // empresa.firmaRepLegal → imagen de firma
      if (tokenKey === "empresa.firmaRepLegal" && value && (value.startsWith("data:image") || value.startsWith("http"))) {
        return { type: "image", attrs: { src: value, alt: "Firma representante legal" } };
      }
      return {
        type: "text",
        text: value,
        marks: node.attrs.resolvedMarks || [{ type: "bold" }],
      };
    }

    if (node.type === "text" && node.text != null) {
      const resolved = resolveMustacheInText(node.text, entities);
      if (resolved !== node.text) {
        const keys = node.text.match(/\{\{([^}#]+)\}\}/g) || [];
        keys.forEach((k: string) => {
          const key = k.replace(/\{\{|\}\}/g, "").trim();
          if (key && !tokenValues[key]) tokenValues[key] = resolveTokenValue(key, entities);
        });
      }
      return { ...node, text: resolved };
    }

    if (node.content && Array.isArray(node.content)) {
      const isDoc = node.type === "doc";
      if (isDoc) {
        const newContent = processConditionalBlocks(node.content, entities, walkNode);
        return { ...node, content: newContent };
      }
      // Párrafos y headings: si el contenido inline tiene {{#if}} repartido en varios nodos,
      // unificar en un solo string antes de resolver
      if ((node.type === "paragraph" || node.type === "heading") && node.content.length > 0) {
        const fullText = serializeInlineToString(node.content, entities);
        if (/\{\{#if|\{\{else\}\}|\{\{\/if\}\}/.test(fullText)) {
          const resolved = resolveMustacheInText(fullText, entities);
          const keys = fullText.match(/\{\{([^}#]+)\}\}/g) || [];
          keys.forEach((k: string) => {
            const key = k.replace(/\{\{|\}\}/g, "").trim();
            if (key && !tokenValues[key]) tokenValues[key] = resolveTokenValue(key, entities);
          });
          const firstText = node.content.find((n: any) => n.type === "text");
          const marks = firstText?.marks || (node.type === "heading" ? [{ type: "bold" }] : undefined);
          return { ...node, content: [{ type: "text", text: resolved, marks }] };
        }
      }
      const newContent = node.content.map((n: any) => walkNode(n));
      return { ...node, content: newContent };
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
 * Enrich guardia entity data with salary structure (baseSalary, colacion, movilizacion, bonos).
 * Call this after buildGuardiaEntityData when resolving documents that use salary tokens.
 * Añade un token por cada bono del catálogo: guardia.bono_{code} = monto (0 si no aplica).
 */
export async function enrichGuardiaWithSalary(
  guardiaData: Record<string, any>,
  guardiaId: string
): Promise<Record<string, any>> {
  const { resolveSalaryStructure } = await import("@/lib/payroll/resolve-salary");
  const { prisma } = await import("@/lib/prisma");
  const salary = await resolveSalaryStructure(guardiaId);

  const bonosTotal = salary.bonos.reduce((sum, b) => sum + b.amount, 0);
  const bonosText =
    salary.bonos.length > 0
      ? salary.bonos.map((b) => `${b.bonoName}: $${b.amount.toLocaleString("es-CL")}`).join("; ")
      : null;

  const salaryBonosByCode = Object.fromEntries(
    salary.bonos.map((b) => [b.bonoCode, b.amount])
  );

  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: { tenantId: true },
  });
  const catalogBonos = guardia
    ? await prisma.payrollBonoCatalog.findMany({
        where: { tenantId: guardia.tenantId, isActive: true },
        select: { code: true },
      })
    : [];

  const bonoFields: Record<string, number> = {};
  for (const b of catalogBonos) {
    bonoFields[`bono_${b.code}`] = salaryBonosByCode[b.code] ?? 0;
  }

  return {
    ...guardiaData,
    baseSalary: salary.baseSalary,
    colacion: salary.colacion,
    movilizacion: salary.movilizacion,
    bonosTotal,
    bonosText,
    ...bonoFields,
  };
}

/**
 * Build entity data for a guardia from raw DB records.
 */
export function buildGuardiaEntityData(guardia: {
  persona: Record<string, any>;
  currentInstallation?: { name: string; address?: string | null; commune?: string | null; city?: string | null } | null;
  bankAccounts?: Array<Record<string, any>>;
  contractType?: string | null;
  contractStartDate?: string | Date | null;
  contractPeriod1End?: string | Date | null;
  contractPeriod2End?: string | Date | null;
  contractCurrentPeriod?: number | null;
  hiredAt?: string | Date | null;
  code?: string | null;
  cargo?: string | null;
}): Record<string, any> {
  const persona = guardia.persona;
  const bank = guardia.bankAccounts?.[0];
  const period = guardia.contractCurrentPeriod ?? 1;
  let contractEndDate = guardia.contractPeriod1End;
  if (period === 2) contractEndDate = guardia.contractPeriod2End;

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
    birthDate: formatDateOnly(persona.birthDate),
    nacionalidad: persona.nacionalidad ?? null,
    afp: persona.afp,
    healthSystem: persona.healthSystem,
    isapreName: persona.isapreName,
    // Datos previsionales (DL 3500, Ley 19.728)
    isJubilado: persona.isJubilado ? "SI" : "NO",
    cotizaAFP: persona.isJubilado ? (persona.cotizaAFP ? "SI" : "NO") : "SI",
    cotizaAFC: persona.isJubilado ? (persona.cotizaAFC ? "SI" : "NO") : "SI",
    cotizaAFCTexto: persona.isJubilado ? (persona.cotizaAFC ? "cotiza" : "no cotiza") : "cotiza",
    cotizaAFPTexto: persona.isJubilado ? (persona.cotizaAFP ? "cotiza" : "opta por no cotizar") : "cotiza",
    regimenPrevisional: persona.regimenPrevisional ?? null,
    regimenPrevisionalLabel: getRegimenPrevisionalLabel(persona.regimenPrevisional),
    hiredAt: formatDateOnly(guardia.hiredAt),
    code: guardia.code,
    cargo: guardia.cargo ?? null,
    currentInstallation: guardia.currentInstallation?.name ?? null,
    installationAddress: guardia.currentInstallation?.address ?? null,
    installationCommune: guardia.currentInstallation?.commune ?? null,
    installationCity: guardia.currentInstallation?.city ?? null,
    contractType: guardia.contractType,
    // Inicio contrato: prioridad a datos de contrato; fallback a hiredAt si no hay contrato guardado
    contractStartDate: formatDateOnly(guardia.contractStartDate || guardia.hiredAt),
    contractEndDate: formatDateOnly(contractEndDate),
    contractPeriod1End: formatDateOnly(guardia.contractPeriod1End),
    contractPeriod2End: formatDateOnly(guardia.contractPeriod2End),
    contractCurrentPeriod: period,
    bankName: bank?.bankName ?? null,
    bankAccountNumber: bank?.accountNumber ?? null,
    bankAccountType: bank?.accountType ?? null,
  };
}

/**
 * Build entity data for the company (empresa).
 * Loads from Setting model key-value pairs with prefix "empresa."
 */
export function buildEmpresaEntityData(settings: Array<{ key: string; value: string }>): Record<string, any> {
  const data: Record<string, any> = {};
  const EMPRESA_KEYS: Record<string, string> = {
    "empresa.razonSocial": "razonSocial",
    "empresa.rut": "rut",
    "empresa.direccion": "direccion",
    "empresa.comuna": "comuna",
    "empresa.ciudad": "ciudad",
    "empresa.telefono": "telefono",
    "empresa.repLegalNombre": "repLegalNombre",
    "empresa.repLegalRut": "repLegalRut",
    "empresa.repLegalFirma": "firmaRepLegal",
  };
  for (const s of settings) {
    const field = EMPRESA_KEYS[s.key];
    if (field) data[field] = s.value;
  }
  return data;
}

/**
 * Build entity data for a labor event (finiquito).
 */
export function buildLaborEventEntityData(event: Record<string, any>): Record<string, any> {
  const causal = CAUSALES_DT.find((c) => c.code === event.causalDtCode);
  return {
    category: event.category,
    subtype: event.subtype,
    finiquitoDate: formatDateOnly(event.finiquitoDate),
    lastWorkDay: formatDateOnly(event.finiquitoDate),
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
