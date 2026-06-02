/**
 * Tenant Presentation Content
 *
 * Contenido editorial de la "Presentación de Empresa" que vive el lead/cliente
 * dentro del portal (sección Presentación). A diferencia de tenant-config.ts
 * (datos legales/branding), esto es el discurso comercial: propuesta de valor,
 * stats, diferenciadores, certificaciones, etc.
 *
 * Se persiste en la tabla Setting bajo claves `empresa.presentacion.*`, con
 * valores JSON. Si el tenant no configuró nada, se usan los defaults (hoy = Gard),
 * de modo que ningún tenant existente cambie su vista actual.
 *
 * Uso:
 *   const content = await getTenantPresentationContent(tenantId);
 */
import { GARD_PRESENTATION_CONTENT } from "@/lib/tenant-presentation-defaults";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Una estadística destacada del hero (ej: "150+" / "Clientes activos"). */
export interface PresentationStat {
  value: string;
  label: string;
}

/**
 * Una sección de la presentación. `key` permite al render asociar un ícono y
 * paleta consistentes (no se serializa un componente en JSON). Keys conocidas:
 * "seguridad" | "tecnologia" | "cumplimiento" | "diferenciadores" |
 * "certificaciones" | "portal". Cualquier otra key cae a un estilo neutro.
 */
export interface PresentationSection {
  key: string;
  title: string;
  items: string[];
}

export interface PresentationContent {
  /** Subtítulo del hero: la frase de propuesta de valor. */
  valueProp: string;
  stats: PresentationStat[];
  sections: PresentationSection[];
  /** Bullets de "qué incluye el servicio" (reusable por GardServiceIncludes). */
  serviceIncludes: string[];
}

/* ------------------------------------------------------------------ */
/*  Setting keys                                                       */
/* ------------------------------------------------------------------ */

const KEYS = {
  valueProp: "empresa.presentacion.valueProp",
  stats: "empresa.presentacion.stats",
  sections: "empresa.presentacion.sections",
  serviceIncludes: "empresa.presentacion.serviceIncludes",
} as const;

const ALL_KEYS = Object.values(KEYS);

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { content: PresentationContent; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function clearTenantPresentationCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseStringArray(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
  } catch {
    /* ignore malformed JSON */
  }
  return null;
}

function parseStats(raw: string): PresentationStat[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (x) => x && typeof x.value === "string" && typeof x.label === "string",
      )
    ) {
      return parsed.map((x) => ({ value: x.value, label: x.label }));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseSections(raw: string): PresentationSection[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (x) =>
          x &&
          typeof x.key === "string" &&
          typeof x.title === "string" &&
          Array.isArray(x.items) &&
          x.items.every((i: unknown) => typeof i === "string"),
      )
    ) {
      return parsed.map((x) => ({ key: x.key, title: x.title, items: x.items }));
    }
  } catch {
    /* ignore */
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Main function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Obtiene el contenido de la presentación de empresa para un tenant.
 * Lee de Setting (claves `empresa.presentacion.*`, formato nuevo
 * `empresa:<tenantId>:<key>` y legacy), con cache de 5 min.
 * Cualquier campo no configurado cae al default (Gard).
 */
export async function getTenantPresentationContent(
  tenantId: string,
): Promise<PresentationContent> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.content;

  // Clonar defaults (deep) para no mutar el objeto compartido.
  const content: PresentationContent = {
    valueProp: GARD_PRESENTATION_CONTENT.valueProp,
    stats: GARD_PRESENTATION_CONTENT.stats.map((s) => ({ ...s })),
    sections: GARD_PRESENTATION_CONTENT.sections.map((s) => ({
      ...s,
      items: [...s.items],
    })),
    serviceIncludes: [...GARD_PRESENTATION_CONTENT.serviceIncludes],
  };

  try {
    const { prisma } = await import("@/lib/prisma");

    const newKeys = ALL_KEYS.map((k) => `empresa:${tenantId}:${k}`);
    let settings = await prisma.setting.findMany({
      where: { tenantId, key: { in: newKeys } },
    });
    if (settings.length === 0) {
      settings = await prisma.setting.findMany({
        where: { tenantId, key: { in: ALL_KEYS } },
      });
    }

    for (const s of settings) {
      const shortKey = s.key.includes(":")
        ? s.key.replace(`empresa:${tenantId}:`, "")
        : s.key;
      if (!s.value) continue;

      if (shortKey === KEYS.valueProp) {
        content.valueProp = s.value;
      } else if (shortKey === KEYS.stats) {
        const stats = parseStats(s.value);
        if (stats) content.stats = stats;
      } else if (shortKey === KEYS.sections) {
        const sections = parseSections(s.value);
        if (sections) content.sections = sections;
      } else if (shortKey === KEYS.serviceIncludes) {
        const inc = parseStringArray(s.value);
        if (inc) content.serviceIncludes = inc;
      }
    }
  } catch (err) {
    console.error(
      "[TENANT_PRESENTATION] Error loading content for tenant",
      tenantId,
      err,
    );
    // Return defaults on error
  }

  cache.set(tenantId, { content, ts: Date.now() });
  return content;
}
