/**
 * Token Resolver — Resuelve tokens con datos reales de las entidades CRM/CPQ
 *
 * Recibe un mapeo de entityType → entityData y resuelve los tokens
 * dentro del contenido Tiptap JSON.
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface EntityData {
  account?: Record<string, any> | null;
  contact?: Record<string, any> | null;
  installation?: Record<string, any> | null;
  deal?: Record<string, any> | null;
  quote?: Record<string, any> | null;
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

  const value = entity[field];
  if (value === null || value === undefined) return `{{${tokenKey}}}`;

  // Format based on type
  if (value instanceof Date) {
    return format(value, "dd/MM/yyyy");
  }

  if (typeof value === "number") {
    return value.toLocaleString("es-CL");
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
