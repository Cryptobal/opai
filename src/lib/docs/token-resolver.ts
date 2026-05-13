/**
 * Token Resolver — Resuelve tokens con datos reales de las entidades CRM/CPQ/Guardia
 *
 * Recibe un mapeo de entityType → entityData y resuelve los tokens
 * dentro del contenido Tiptap JSON.
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CAUSALES_DT } from "@/lib/guard-events";
import { clpToUf } from "@/lib/uf-utils";

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
import { formatPersonName, getRegimenPrevisionalLabel } from "@/lib/personas";

export interface EntityData {
  empresa?: Record<string, any> | null;
  account?: Record<string, any> | null;
  contact?: Record<string, any> | null;
  installation?: Record<string, any> | null;
  deal?: Record<string, any> | null;
  quote?: Record<string, any> | null;
  contract?: Record<string, any> | null;
  guardia?: Record<string, any> | null;
  labor_event?: Record<string, any> | null;
  lead?: Record<string, any> | null;
  actor?: Record<string, any> | null;
  tenant?: Record<string, any> | null;
  system?: Record<string, any> | null;
  blocks?: Record<string, any> | null;
  /** DTE (factura) — usado en plantillas de cobranza desde el flujo de caja. */
  dte?: Record<string, any> | null;
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

  // System tokens (built-in: today/year/month/todayLong; runtime: portalUrl/portalPin/formUrl/mapsLink via entities.system)
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
    }
    // Runtime tokens (portalUrl, portalPin, formUrl, mapsLink, etc.) provistos vía entities.system
    const sys = entities.system as Record<string, any> | undefined;
    if (sys) {
      const value = sys[field];
      if (value !== null && value !== undefined && value !== "") {
        return String(value);
      }
    }
    return `{{${tokenKey}}}`;
  }

  // Lead tokens (acepta lead.fullName como composición especial)
  if (module === "lead") {
    const lead = entities.lead as Record<string, any> | undefined;
    if (!lead) return `{{${tokenKey}}}`;
    if (field === "fullName") {
      const first = lead.firstName || "";
      const last = lead.lastName || "";
      return `${first} ${last}`.trim() || `{{${tokenKey}}}`;
    }
    const value = lead[field];
    if (value === null || value === undefined || value === "") return `{{${tokenKey}}}`;
    return String(value);
  }

  // Actor tokens (ejecutivo logueado)
  if (module === "actor") {
    const actor = entities.actor as Record<string, any> | undefined;
    if (!actor) return `{{${tokenKey}}}`;
    if (field === "fullName") {
      const first = actor.firstName || "";
      const last = actor.lastName || "";
      const full = `${first} ${last}`.trim();
      if (full) return full;
      if (actor.name) return String(actor.name);
      if (actor.email) return String(actor.email);
      return `{{${tokenKey}}}`;
    }
    const value = actor[field];
    if (value === null || value === undefined || value === "") return `{{${tokenKey}}}`;
    return String(value);
  }

  // Tenant tokens (datos de la empresa-marca)
  if (module === "tenant") {
    const tenant = entities.tenant as Record<string, any> | undefined;
    if (!tenant) return `{{${tokenKey}}}`;
    const value = tenant[field];
    if (value === null || value === undefined || value === "") return `{{${tokenKey}}}`;
    return String(value);
  }

  // Block tokens (texto pre-formateado, se inserta tal cual; ausencia = vacío para no romper el mensaje)
  if (module === "blocks") {
    const blocks = entities.blocks as Record<string, any> | undefined;
    if (!blocks) return "";
    const value = blocks[field];
    if (value === null || value === undefined) return "";
    return String(value);
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

  // Compatibilidad/fallback entre módulos deal e installation para el nombre
  // de instalación, porque en algunos flujos solo viene uno de los dos.
  if (module === "deal" && field === "installationName") {
    const fromDeal = entity.installationName;
    if (fromDeal) return String(fromDeal);
    const fromInstallation = entities.installation?.name;
    if (fromInstallation) return String(fromInstallation);
  }
  if (module === "installation" && field === "name") {
    const fromInstallation = entity.name;
    if (fromInstallation) return String(fromInstallation);
    const fromDeal = entities.deal?.installationName;
    if (fromDeal) return String(fromDeal);
  }

  // Quote: contract-service specific COMPUTED tokens.
  // Must run BEFORE the `entity[field]` generic lookup below, because these
  // tokens don't map 1:1 to a quote column — they derive their value from
  // other fields (salePriceUF, salePriceMonthly, contractStartDate, etc.).
  // If we let the generic lookup run first, it returns undefined and the
  // early-return kills the token.
  if (module === "quote") {
    if (field === "precioNeto") {
      const val = entity.salePriceMonthly ?? entity.monthlyCost;
      if (val) return Number(val).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
      return "";
    }
    if (field === "precioUF") {
      return entity.salePriceUF ? `${Number(entity.salePriceUF).toFixed(2)} UF` : "";
    }
    if (field === "precioTotal") {
      // Same precedence as buildQuoteEnrichedData: contractDuration (user-set)
      // beats contractMonths (legacy default).
      const months = entity.contractDuration ?? entity.contractMonths ?? 12;
      if (entity.currency === "UF") {
        const ufMonthly = Number(entity.salePriceUF ?? 0);
        if (!ufMonthly || !Number.isFinite(ufMonthly)) return "";
        const total = ufMonthly * months;
        return `${total.toFixed(2)} UF`;
      }
      const monthly = Number(entity.salePriceMonthly ?? entity.monthlyCost ?? 0);
      const total = monthly * months;
      return total ? total.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }) : "";
    }
    if (field === "polinomioDescripcion") {
      const ipc = entity.ipcWeight ?? 0;
      const imo = entity.imoWeight ?? 0;
      if (ipc === 0 && imo === 0) return "";
      return `${imo}% IMO + ${ipc}% IPC`;
    }
    if (field === "contractStartDate") {
      // Pre-normalized in buildQuoteEnrichedData to YYYY-MM-DD. Format via
      // formatDateOnly so "2026-04-01" displays as "01/04/2026" without TZ drift.
      if (!entity.contractStartDate) return "";
      return formatDateOnly(entity.contractStartDate) ?? "";
    }
    if (field === "contractEndDate") {
      if (!entity.contractStartDate) return "";
      const months = entity.contractDuration ?? entity.contractMonths ?? 12;
      // Parse as a plain calendar date (YYYY-MM-DD) to avoid local-vs-UTC
      // timezone drift: `new Date("2026-04-01")` is UTC midnight, whose local
      // representation can be the previous day, which then poisons the end-date
      // arithmetic (returns 01/07 instead of 30/06 in western timezones).
      const raw = typeof entity.contractStartDate === "string"
        ? entity.contractStartDate
        : entity.contractStartDate instanceof Date
        ? entity.contractStartDate.toISOString()
        : String(entity.contractStartDate);
      const m = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      let y: number, mo: number, d: number;
      if (m) {
        y = Number(m[1]);
        mo = Number(m[2]) - 1;
        d = Number(m[3]);
      } else {
        const start = new Date(raw);
        if (isNaN(start.getTime())) return "";
        y = start.getUTCFullYear();
        mo = start.getUTCMonth();
        d = start.getUTCDate();
      }
      // start + N months, minus 1 day. We use UTC Date arithmetic so overflow
      // (e.g. March 31 + 3 months → July 1 → rollback to June 30) is deterministic.
      const end = new Date(Date.UTC(y, mo + months, d));
      end.setUTCDate(end.getUTCDate() - 1);
      if (isNaN(end.getTime())) return "";
      return formatDateOnly(end) ?? "";
    }
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

  // Quote: non-computed tokens with custom formatting
  if (module === "quote") {
    if (field === "adjustmentType") {
      const map: Record<string, string> = {
        NONE: "Sin reajuste",
        IPC: "IPC",
        IMO: "Índice de Mano de Obra",
        POLYNOMIAL: "Polinomio mixto IPC + IMO",
      };
      return map[entity.adjustmentType] ?? entity.adjustmentType ?? "";
    }
    if (field === "adjustmentFreq") {
      const map: Record<string, string> = {
        TRIMESTRAL: "trimestral",
        SEMESTRAL: "semestral",
        ANUAL: "anual",
      };
      return map[entity.adjustmentFreq] ?? entity.adjustmentFreq ?? "";
    }
    if (field === "ipcWeight") {
      const w = entity.ipcWeight;
      if (w == null || w === "") return "";
      const n = Number(w);
      if (isNaN(n)) return "";
      return `${n}%`;
    }
    if (field === "imoWeight") {
      const w = entity.imoWeight;
      if (w == null || w === "") return "";
      const n = Number(w);
      if (isNaN(n)) return "";
      return `${n}%`;
    }
  }

  // Currency formatting for quote pricing fields
  if (
    module === "quote" &&
    ["monthlyCost", "salePriceMonthly", "contractAmount", "precioNeto", "precioTotal"].includes(field)
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

function collectTokenKeysFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(/\{\{([^}#]+)\}\}/g) || [];
  return matches
    .map((m) => m.replace(/\{\{|\}\}/g, "").trim())
    .filter(Boolean);
}

/** Módulos permitidos en expresiones {{#if ...}}. */
const CONDITIONAL_MODULES = new Set([
  "guardia", "quote", "empresa", "account", "contract",
  "installation", "deal", "contact",
]);

/**
 * Evalúa expresiones tipo:
 *   quote.currency=="UF"
 *   quote.adjustmentType=="POLYNOMIAL"
 *   quote.ipcWeight>0
 *   guardia.isJubilado=="SI"
 *   account.notaryName (truthy)
 */
function evaluateCondition(expr: string, entities: EntityData): boolean {
  const text = expr.trim();
  const m1 = /^([a-z]+)\.(\w+)\s*>\s*(-?\d+(?:\.\d+)?)$/i.exec(text);
  if (m1 && CONDITIONAL_MODULES.has(m1[1])) {
    const entity = entities[m1[1] as keyof EntityData] as Record<string, any> | undefined;
    if (!entity) return false;
    const num = Number(entity[m1[2]]);
    return !isNaN(num) && num > Number(m1[3]);
  }
  const m2 = /^([a-z]+)\.(\w+)\s*==\s*"([^"]*)"$/i.exec(text);
  if (m2 && CONDITIONAL_MODULES.has(m2[1])) {
    const entity = entities[m2[1] as keyof EntityData] as Record<string, any> | undefined;
    if (!entity) return false;
    const actual = String(entity[m2[2]] ?? "").toLowerCase();
    const expected = m2[3].toLowerCase();
    return actual === expected;
  }
  const m3 = /^([a-z]+)\.(\w+)$/i.exec(text);
  if (m3 && CONDITIONAL_MODULES.has(m3[1])) {
    const entity = entities[m3[1] as keyof EntityData] as Record<string, any> | undefined;
    if (!entity) return false;
    const val = entity[m3[2]];
    if (val === null || val === undefined) return false;
    if (val === false || val === 0 || val === "") return false;
    return true;
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

/**
 * Procesa bloques {{#if expr}}...{{else}}...{{/if}} a nivel de hijos del doc.
 *
 * Soporta:
 *  - Bloques {{#if}}...{{/if}} simples y anidados.
 *  - Rama {{else}} (incluyendo "else-if" escrito como {{else}}{{#if ...}} ... {{/if}}{{/if}}).
 *  - Múltiples markers en un solo nodo (ej.: "{{else}}{{#if X}}" o "{{/if}}{{/if}}"),
 *    siempre que el texto del nodo consista ÚNICAMENTE de markers de control.
 *
 * Algoritmo: tokeniza la lista de nodos a (control|node), luego camina con
 * stack de scopes. Cada scope registra si la rama actual emite contenido
 * (`inBranch`) y si ya se emitió alguna rama true (`hasTrueBranch`) para
 * decidir el destino del `{{else}}`.
 */
function processConditionalBlocks(
  nodes: any[],
  entities: EntityData,
  walkNode: (n: any) => any
): any[] {
  type ControlToken =
    | { type: "control"; kind: "if"; expr: string }
    | { type: "control"; kind: "else" }
    | { type: "control"; kind: "endif" };
  type NodeToken = { type: "node"; node: any };
  type Token = ControlToken | NodeToken;

  const CONTROL_ONLY = /^(?:\{\{#if\s+[^}]+\}\}|\{\{else\}\}|\{\{\/if\}\})+$/;
  const CONTROL_SPLIT = /\{\{#if\s+([^}]+)\}\}|\{\{else\}\}|\{\{\/if\}\}/g;

  const tokens: Token[] = [];
  for (const node of nodes) {
    const text = getNodeText(node).trim();
    if (text && CONTROL_ONLY.test(text)) {
      for (const m of text.matchAll(CONTROL_SPLIT)) {
        if (m[1] !== undefined) {
          tokens.push({ type: "control", kind: "if", expr: m[1].trim() });
        } else if (m[0] === "{{else}}") {
          tokens.push({ type: "control", kind: "else" });
        } else {
          tokens.push({ type: "control", kind: "endif" });
        }
      }
    } else {
      tokens.push({ type: "node", node });
    }
  }

  type Scope = { inBranch: boolean; hasTrueBranch: boolean };
  const stack: Scope[] = [];
  const isEmitting = () =>
    stack.length === 0 ? true : stack[stack.length - 1].inBranch;
  const parentEmitting = () =>
    stack.length <= 1 ? true : stack[stack.length - 2].inBranch;

  const result: any[] = [];
  for (const tk of tokens) {
    if (tk.type === "node") {
      if (isEmitting()) result.push(walkNode(tk.node));
      continue;
    }
    if (tk.kind === "if") {
      const conditionMet = evaluateCondition(tk.expr, entities);
      const inBranch = isEmitting() && conditionMet;
      stack.push({ inBranch, hasTrueBranch: inBranch });
    } else if (tk.kind === "else") {
      const top = stack[stack.length - 1];
      if (!top) continue;
      const inBranch = parentEmitting() && !top.hasTrueBranch;
      top.inBranch = inBranch;
      if (inBranch) top.hasTrueBranch = true;
    } else {
      if (stack.length > 0) stack.pop();
    }
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

  const registerTokensFromText = (text: string) => {
    const keys = collectTokenKeysFromText(text);
    keys.forEach((key) => {
      if (!tokenValues[key]) {
        tokenValues[key] = resolveTokenValue(key, entities);
      }
    });
  };

  const resolveAttrs = (attrs: Record<string, any> | undefined) => {
    if (!attrs) return attrs;
    let changed = false;
    const nextAttrs: Record<string, any> = { ...attrs };

    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === "string") {
        let resolvedValue = resolveMustacheInText(value, entities);
        if (key === "href" || key === "src") {
          // Evita URL inválida al resolver tokens cuando quedó "https://https://..."
          resolvedValue = resolvedValue.replace(/^(https?:\/\/)(https?:\/\/)/i, "$2");
        }
        if (resolvedValue !== value) {
          changed = true;
          nextAttrs[key] = resolvedValue;
        }
        registerTokensFromText(value);
      }
    }

    return changed ? nextAttrs : attrs;
  };

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
      // HTML content (tables, etc.) → rawHtml node to avoid escaping
      if (value && /<(table|div|ul|ol)\b/i.test(value)) {
        return { type: "rawHtml", attrs: { html: value } };
      }
      // ProseMirror/Tiptap rechaza text nodes con string vacío. Si el token
      // resuelve a "" (dato faltante), dejamos el nodo original para que se
      // vea el badge del token sin resolver en lugar de corromper el doc.
      if (!value) return node;
      return {
        type: "text",
        text: value,
        marks: node.attrs.resolvedMarks || [{ type: "bold" }],
      };
    }

    if (node.type === "text" && node.text != null) {
      const resolved = resolveMustacheInText(node.text, entities);
      if (resolved !== node.text) {
        registerTokensFromText(node.text);
      }
      const resolvedMarks = Array.isArray(node.marks)
        ? node.marks.map((mark: any) => {
            if (!mark || typeof mark !== "object") return mark;
            if (!mark.attrs || typeof mark.attrs !== "object") return mark;
            const attrs = resolveAttrs(mark.attrs as Record<string, any>);
            return attrs === mark.attrs ? mark : { ...mark, attrs };
          })
        : node.marks;
      // Evita text nodes vacíos que rompen ProseMirror/Tiptap al cargar.
      if (!resolved) return null;
      return {
        ...node,
        text: resolved,
        ...(resolvedMarks ? { marks: resolvedMarks } : {}),
      };
    }

    const resolvedNodeAttrs = resolveAttrs(node.attrs as Record<string, any> | undefined);

    if (node.content && Array.isArray(node.content)) {
      const isDoc = node.type === "doc";
      if (isDoc) {
        const newContent = processConditionalBlocks(node.content, entities, walkNode).filter(Boolean);
        return { ...node, ...(resolvedNodeAttrs ? { attrs: resolvedNodeAttrs } : {}), content: newContent };
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
          // Si el texto unificado queda vacío, devolvemos el párrafo/heading vacío
          // (sin children) — Tiptap permite párrafos vacíos, pero no text nodes vacíos.
          if (!resolved) return { ...node, content: [] };
          return { ...node, content: [{ type: "text", text: resolved, marks }] };
        }
      }
      const newContent = node.content.map((n: any) => walkNode(n)).filter(Boolean);
      return { ...node, ...(resolvedNodeAttrs ? { attrs: resolvedNodeAttrs } : {}), content: newContent };
    }

    if (resolvedNodeAttrs && resolvedNodeAttrs !== node.attrs) {
      return { ...node, attrs: resolvedNodeAttrs };
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

  const extractFromValue = (value: unknown) => {
    if (typeof value !== "string") return;
    const textKeys = collectTokenKeysFromText(value);
    textKeys.forEach((k) => keys.add(k));
  };

  function walkNode(node: any): void {
    if (!node) return;

    if (node.type === "contractToken" && node.attrs?.tokenKey) {
      keys.add(node.attrs.tokenKey);
    }

    if (node.type === "text" && typeof node.text === "string") {
      extractFromValue(node.text);
    }

    if (node.attrs && typeof node.attrs === "object") {
      Object.values(node.attrs).forEach(extractFromValue);
    }

    if (Array.isArray(node.marks)) {
      node.marks.forEach((mark: any) => {
        if (!mark || typeof mark !== "object" || !mark.attrs) return;
        Object.values(mark.attrs).forEach(extractFromValue);
      });
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
  asignaciones?: Array<{ startDate?: string | Date | null; isActive?: boolean }>;
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
    fullName: formatPersonName(persona.firstName, persona.lastName).trim(),
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
    fechaInicioInstalacion: formatDateOnly(
      guardia.asignaciones?.find((a) => a.isActive)?.startDate ?? null
    ),
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
    "empresa.fechaEscrituraPublica": "fechaEscrituraPublica",
    "empresa.nombreNotaria": "nombreNotaria",
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
/**
 * Build enriched quote entity data with positions table, installations table, and pricing.
 * Used for contract generation from CRM accounts.
 */
export async function buildQuoteEnrichedData(
  quoteId: string,
  opts?: { ufValue?: number | null }
): Promise<Record<string, any>> {
  const { prisma } = await import("@/lib/prisma");

  const quote = await prisma.cpqQuote.findUnique({
    where: { id: quoteId },
    include: {
      positions: {
        include: {
          puestoTrabajo: true,
          cargo: true,
        },
        orderBy: { createdAt: "asc" },
      },
      parameters: true,
    },
  });

  if (!quote) return {};

  // CpqQuote has no direct account relation — fetch separately via accountId
  const accountWithInstallations = quote.accountId
    ? await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        select: { installations: { select: { name: true, address: true, commune: true, city: true }, where: { status: { in: ["active", "prospect"] } } } },
      })
    : null;

  const params = quote.parameters;

  // Build positions table HTML
  const posRows = quote.positions.map((p: any) => {
    const name = p.customName || p.puestoTrabajo?.name || p.cargo?.name || "Puesto";
    const days = Array.isArray(p.weekdays) ? (p.weekdays as string[]).join(", ") : "L-D";
    const schedule = `${p.startTime || "00:00"} - ${p.endTime || "00:00"}`;
    return `<tr><td>${name}</td><td>${days} ${schedule}</td><td>${p.numGuards ?? 1}</td><td>${p.numPuestos ?? 1}</td></tr>`;
  });
  const positionsTable = posRows.length > 0
    ? `<table><thead><tr><th>Puesto</th><th>Horario</th><th>Guardias</th><th>Puestos</th></tr></thead><tbody>${posRows.join("")}</tbody></table>`
    : "";

  // Build installations table HTML
  const installations = accountWithInstallations?.installations ?? [];
  const instRows = installations.map((i: any) =>
    `<tr><td>${i.name}</td><td>${i.address || ""}${i.commune ? `, ${i.commune}` : ""}</td></tr>`
  );
  const installationsTable = instRows.length > 0
    ? `<table><thead><tr><th>Instalación</th><th>Dirección</th></tr></thead><tbody>${instRows.join("")}</tbody></table>`
    : "";

  // Build dotación resumen text
  const dotacionResumen = quote.positions.map((p: any) => {
    const name = p.customName || p.puestoTrabajo?.name || p.cargo?.name || "Puesto";
    const guards = p.numGuards ?? 1;
    const puestos = p.numPuestos ?? 1;
    const days = Array.isArray(p.weekdays) ? (p.weekdays as string[]).join(", ") : "L-D";
    const schedule = `${p.startTime || "00:00"} - ${p.endTime || "00:00"}`;
    return `${guards * puestos}x ${name} (${days} ${schedule})`;
  }).join(", ");

  // Sale price (stored in CLP regardless of quote currency)
  const salePriceMonthly = params?.salePriceMonthly
    ? Number(params.salePriceMonthly)
    : (params?.salePriceBase ? Number(params.salePriceBase) : Number(quote.monthlyCost ?? 0));

  const currency = quote.currency ?? "UF";

  // Compute UF equivalent when currency is UF (using today's UF value).
  // We query fxUfRate DIRECTLY with the same `prisma` client above, to avoid
  // importing `@/lib/uf` (which has `import "server-only"` — pollutes client
  // bundles because token-resolver is also imported from Client Components).
  let salePriceUF: string = "";
  if (currency === "UF" && salePriceMonthly > 0) {
    let ufValue = Number(opts?.ufValue ?? 0);
    if (!ufValue || ufValue <= 0) {
      try {
        const rate = await prisma.fxUfRate.findFirst({ orderBy: { date: "desc" } });
        if (rate) ufValue = Number(rate.value);
      } catch (e) {
        console.error("[buildQuoteEnrichedData] fxUfRate lookup failed:", e);
      }
    }
    if (ufValue > 0) {
      salePriceUF = clpToUf(salePriceMonthly, ufValue).toFixed(2);
    } else {
      console.warn("[buildQuoteEnrichedData] salePriceUF empty: ufValue=%s salePriceMonthly=%s", ufValue, salePriceMonthly);
    }
  }

  // Prefer quote.contractDuration (user-facing commercial-conditions field).
  // `params.contractMonths` is a legacy/default column (Int default 12) and
  // is rarely updated by the UI, so it must not win over the user's explicit
  // contractDuration.
  const contractMonths =
    quote.contractDuration ?? params?.contractMonths ?? 12;
  const contractAmount = salePriceMonthly * contractMonths;

  return {
    code: quote.code,
    currency,
    monthlyCost: Number(quote.monthlyCost ?? 0),
    totalPositions: quote.totalPositions ?? 0,
    totalGuards: quote.totalGuards ?? 0,
    clientName: quote.clientName ?? "",
    salePriceMonthly,
    salePriceUF,
    contractMonths,
    contractAmount,
    positionsTable,
    installationsTable,
    dotacionResumen,
    // Contract service fields
    adjustmentType: (quote as any).adjustmentType ?? "NONE",
    adjustmentFreq: (quote as any).adjustmentFreq ?? null,
    ipcWeight: (quote as any).ipcWeight ?? 0,
    imoWeight: (quote as any).imoWeight ?? 0,
    // Default 1500 UF when the quote has no póliza set (null / 0). This
    // keeps the CUARTA / SÉPTIMA clauses from rendering as "0 UF" or an
    // unresolved token. User can override from Condiciones Comerciales.
    insurancePolicyUF: (() => {
      const raw = (quote as any).insurancePolicyUF;
      const n = raw != null ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 1500;
    })(),
    // Stored as YYYY-MM-DD string (canonical, TZ-independent). The resolver
    // renders {{quote.contractStartDate}} as dd/MM/yyyy via a dedicated case
    // (see `resolveTokenValue` above), and {{quote.contractEndDate}} uses
    // this same ISO string for UTC-safe date arithmetic.
    contractStartDate: (() => {
      const raw = (quote as any).contractStartDate;
      if (!raw) return null;
      const iso = raw instanceof Date ? raw.toISOString() : String(raw);
      return iso.slice(0, 10);
    })(),
    contractDuration: quote.contractDuration ?? 12,
    liabilityMonths: (quote as any).liabilityMonths ?? 3,
    hasCCTV: (quote as any).hasCCTV ?? false,
    cctvRetentionDays: (quote as any).cctvRetentionDays ?? 30,
    paymentDays: (quote as any).paymentDays ?? 5,
    realAnnualIncrement: (quote as any).realAnnualIncrement ?? 3,
  };
}

/**
 * Build contract entity data from dates provided by the user.
 */
export function buildContractEntityData(data: {
  title?: string;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  durationMonths?: number | null;
}): Record<string, any> {
  return {
    title: data.title ?? "",
    effectiveDate: formatDateOnly(data.effectiveDate),
    expirationDate: formatDateOnly(data.expirationDate),
    durationMonths: data.durationMonths ?? null,
  };
}

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

