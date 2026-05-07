/**
 * WhatsApp Template — Legacy Placeholder Migration
 *
 * Algunos tenants tienen plantillas WA sembradas con la versión vieja de
 * placeholders (single-brace, p. ej. `{nombre}`, `{empresa}`). El token
 * resolver sólo entiende el formato `{{module.field}}`, por lo que esos
 * placeholders quedaban literales en el WhatsApp prellenado.
 *
 * Este módulo provee:
 *  - LEGACY_WA_PLACEHOLDER_MAP: mapeo por slug de placeholder viejo → nuevo.
 *  - hasLegacyWaPlaceholders(): detecta si un texto contiene tokens viejos
 *    para algún slug conocido.
 *  - migrateLegacyPlaceholdersInText(): re-escribe un texto plano.
 *  - migrateLegacyPlaceholdersInTiptap(): re-escribe un documento Tiptap JSON
 *    sin alterar la estructura — sólo los `text` de los nodos.
 *
 * Uso típico (lazy/self-healing en getWaTemplate): si el contenido del
 * DocTemplate contiene placeholders viejos, lo migramos en memoria y lo
 * persistimos best-effort. Es idempotente.
 */

/** Mapeo de placeholder viejo (sin llaves) → token `{{module.field}}`, por slug. */
export const LEGACY_WA_PLACEHOLDER_MAP: Record<string, Record<string, string>> = {
  lead_commercial: {
    nombre: "{{lead.firstName}}",
    apellido: "{{lead.lastName}}",
    empresa: "{{lead.companyName}}",
    direccion: "{{lead.address}}",
    servicio: "{{lead.serviceLabel}}",
    dotacion: "{{lead.dotacionResumen}}",
    website: "{{tenant.website}}",
  },
  lead_client: {
    nombre: "{{lead.firstName}}",
    apellido: "{{lead.lastName}}",
    empresa: "{{lead.companyName}}",
    maps_link: "{{system.mapsLink}}",
  },
  proposal_sent: {
    contactName: "{{contact.firstName}}",
    companyName: "{{account.name}}",
    proposalUrl: "{{deal.proposalLink}}",
    proposalLink: "{{deal.proposalLink}}",
  },
  followup_first: {
    contactName: "{{contact.firstName}}",
    dealTitle: "{{deal.title}}",
    proposalSentDate: "{{deal.proposalSentDate}}",
    proposalLink: "{{deal.proposalLink}}",
  },
  followup_second: {
    contactName: "{{contact.firstName}}",
    dealTitle: "{{deal.title}}",
    proposalSentDate: "{{deal.proposalSentDate}}",
    proposalLink: "{{deal.proposalLink}}",
  },
  followup_third: {
    contactName: "{{contact.firstName}}",
    dealTitle: "{{deal.title}}",
    proposalSentDate: "{{deal.proposalSentDate}}",
    proposalLink: "{{deal.proposalLink}}",
  },
};

/**
 * Regex que matchea single-brace placeholders `{name}` sin estar precedidos
 * por otra `{` (lo que evitaría tocar `{{name}}`). Se usa la negative lookbehind
 * y lookahead correspondiente para diferenciar `{x}` de `{{x}}`.
 */
const LEGACY_PLACEHOLDER_RE = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g;

/**
 * Regex equivalente para tokens del estilo `{module.field}` (legacy con punto).
 * Estos suelen ser de templates email/seguimiento donde el seed se generó con
 * el cuerpo plano `{contact.firstName}` en vez de `{{contact.firstName}}`.
 */
const LEGACY_QUALIFIED_PLACEHOLDER_RE =
  /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g;

/** Devuelve true si `text` contiene placeholders viejos para `slug` o cualquier `{module.field}`. */
export function hasLegacyWaPlaceholders(text: string, slug?: string): boolean {
  if (!text) return false;
  if (LEGACY_QUALIFIED_PLACEHOLDER_RE.test(text)) {
    LEGACY_QUALIFIED_PLACEHOLDER_RE.lastIndex = 0;
    return true;
  }
  if (!slug) return false;
  const map = LEGACY_WA_PLACEHOLDER_MAP[slug];
  if (!map) return false;
  LEGACY_PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LEGACY_PLACEHOLDER_RE.exec(text)) !== null) {
    if (Object.prototype.hasOwnProperty.call(map, m[1])) return true;
  }
  return false;
}

/**
 * Reemplaza placeholders viejos en un string:
 *  - `{module.field}` → `{{module.field}}` (siempre, independiente del slug).
 *  - `{name}` → mapeo del slug si existe en LEGACY_WA_PLACEHOLDER_MAP[slug].
 */
export function migrateLegacyPlaceholdersInText(text: string, slug?: string): string {
  if (!text) return text;
  let out = text;

  out = out.replace(LEGACY_QUALIFIED_PLACEHOLDER_RE, (_, key: string) => `{{${key}}}`);

  if (slug) {
    const map = LEGACY_WA_PLACEHOLDER_MAP[slug];
    if (map) {
      out = out.replace(LEGACY_PLACEHOLDER_RE, (full, name: string) =>
        Object.prototype.hasOwnProperty.call(map, name) ? map[name] : full,
      );
    }
  }

  return out;
}

/**
 * Recorre un documento Tiptap JSON y migra el `text` de cada nodo `text`,
 * más los `attrs` de marks/links donde haya URLs con tokens (p. ej. el `href`
 * de un link a `{deal.proposalLink}` debe pasar a `{{deal.proposalLink}}`).
 * Devuelve `{ migrated, changed }` para que el caller decida si persistir.
 */
export function migrateLegacyPlaceholdersInTiptap(
  doc: unknown,
  slug?: string,
): { migrated: unknown; changed: boolean } {
  let changed = false;

  const migrateString = (s: string): string => {
    const next = migrateLegacyPlaceholdersInText(s, slug);
    if (next !== s) changed = true;
    return next;
  };

  const migrateAttrs = (attrs: Record<string, any> | undefined) => {
    if (!attrs || typeof attrs !== "object") return attrs;
    const out: Record<string, any> = { ...attrs };
    let dirty = false;
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === "string") {
        const next = migrateLegacyPlaceholdersInText(v, slug);
        if (next !== v) {
          out[k] = next;
          dirty = true;
        }
      }
    }
    if (dirty) {
      changed = true;
      return out;
    }
    return attrs;
  };

  const walk = (node: any): any => {
    if (!node || typeof node !== "object") return node;
    let next = node;

    if (node.type === "text" && typeof node.text === "string") {
      const t = migrateString(node.text);
      if (t !== node.text) next = { ...next, text: t };
    }

    if (next.attrs) {
      const a = migrateAttrs(next.attrs);
      if (a !== next.attrs) next = { ...next, attrs: a };
    }

    if (Array.isArray(next.marks)) {
      const nextMarks = next.marks.map((m: any) => {
        if (!m || typeof m !== "object" || !m.attrs) return m;
        const a = migrateAttrs(m.attrs);
        return a === m.attrs ? m : { ...m, attrs: a };
      });
      const marksChanged = nextMarks.some(
        (m: unknown, idx: number) => m !== next.marks[idx],
      );
      if (marksChanged) next = { ...next, marks: nextMarks };
    }

    if (Array.isArray(next.content)) {
      const nextContent = next.content.map(walk);
      const childChanged = nextContent.some(
        (child: unknown, idx: number) => child !== next.content[idx],
      );
      if (childChanged) next = { ...next, content: nextContent };
    }

    return next;
  };

  const migrated = walk(doc);
  return { migrated, changed };
}
