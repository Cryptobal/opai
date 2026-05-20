/**
 * Resend Email Service
 *
 * Cliente configurado para envío de emails con Resend.
 * La config se puede sobreescribir por tenant desde Configuración > Empresa.
 */

import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY no está configurada en variables de entorno');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Headers anti-spam recomendados por Gmail/Yahoo (RFC 8058) para todos los
 * envíos transaccionales y de marketing. La presencia de `List-Unsubscribe`
 * + `List-Unsubscribe-Post` reduce el riesgo de que un correo legítimo caiga
 * en spam. El mailto debería apuntar a una casilla monitoreada del tenant.
 *
 * Uso:
 *   import { buildDeliverabilityHeaders } from "@/lib/resend";
 *   const headers = buildDeliverabilityHeaders(tenantConfig.emailReplyTo);
 *   await resend.emails.send({ ..., headers });
 */
export function buildDeliverabilityHeaders(unsubscribeMailto?: string | null): {
  'List-Unsubscribe': string;
  'List-Unsubscribe-Post': string;
} {
  const trimmed = (unsubscribeMailto ?? '').trim();
  const target = trimmed.length > 0 ? trimmed : 'unsubscribe@opai.cl';
  return {
    'List-Unsubscribe': `<mailto:${target}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** @deprecated — Usar getTenantCompanyConfig(tenantId) de @/lib/tenant-config */
export const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || 'OPAI <noreply@opai.cl>',
  replyTo: process.env.EMAIL_REPLY_TO || '',
  companyName: 'OPAI',
};

export interface TenantEmailConfig {
  from: string;
  replyTo: string;
  logoUrl: string;
  companyName: string;
  /** Slug del tenant para construir URLs absolutas en emails (subdomain). */
  tenantSlug: string | null;
  /** BCC permanente para TODOS los envíos finance de este tenant. */
  alwaysBcc: string[];
}

const tenantEmailCache = new Map<string, { config: TenantEmailConfig; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function clearTenantEmailConfigCache(tenantId: string): void {
  tenantEmailCache.delete(tenantId);
  routingCache.delete(tenantId);
}

/** Alias semántico de clearTenantEmailConfigCache para callers de config update. */
export function invalidateTenantEmailCache(tenantId: string): void {
  tenantEmailCache.delete(tenantId);
  routingCache.delete(tenantId);
}

/**
 * Resuelve la configuración de email para un tenant.
 * Lee de Settings (empresa.emailFrom, empresa.emailReplyTo, etc.) con cache de 5min.
 * Si no hay config en BD, usa los defaults de EMAIL_CONFIG (env vars).
 */
export async function getTenantEmailConfig(tenantId: string): Promise<TenantEmailConfig> {
  const cached = tenantEmailCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config;

  try {
    const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
    const cfg = await getTenantCompanyConfig(tenantId);

    const { prisma } = await import("@/lib/prisma");
    const [tenant, dteCfg] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      }),
      prisma.tenantDteConfig.findUnique({
        where: { tenantId },
        select: { alwaysBcc: true, fromName: true, replyTo: true },
      }),
    ]);

    // Override "from" name si TenantDteConfig.fromName está definido.
    // El "from" base trae formato "Nombre <email@dominio>"; reemplazamos
    // solo la parte del display name preservando el address.
    let from = cfg.emailFrom;
    if (dteCfg?.fromName && dteCfg.fromName.trim().length > 0) {
      const match = cfg.emailFrom.match(/<([^>]+)>/);
      const address = match?.[1] ?? cfg.emailFrom;
      from = `${dteCfg.fromName.trim()} <${address}>`;
    }

    const config: TenantEmailConfig = {
      from,
      replyTo: dteCfg?.replyTo?.trim() || cfg.emailReplyTo,
      logoUrl: cfg.logoUrl || "",
      companyName: cfg.companyName || EMAIL_CONFIG.companyName,
      tenantSlug: tenant?.slug ?? null,
      alwaysBcc: (dteCfg?.alwaysBcc ?? [])
        .map((e) => e?.trim())
        .filter((e): e is string => !!e && e.length > 0),
    };

    tenantEmailCache.set(tenantId, { config, ts: Date.now() });
    return config;
  } catch {
    return {
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      logoUrl: "",
      companyName: EMAIL_CONFIG.companyName,
      tenantSlug: null,
      alwaysBcc: [],
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Per-module routing                                                 */
/* ------------------------------------------------------------------ */

export type EmailModule = "commercial" | "operations" | "finance" | "system";

export interface ModuleRouting {
  /** Emails que reciben CCO automático. Vacío si el módulo no tiene CCO configurado o está disabled. */
  bcc: string[];
  /** Reply-to específico del módulo si se configuró, sino el global. Nunca vacío si el tenant tiene replyTo global. */
  replyTo: string;
}

export interface TenantEmailRouting {
  /** From base (display + address) — mismo para todos los módulos. */
  from: string;
  /** Reply-to global del tenant — fallback para módulos sin override. */
  replyToGlobal: string;
  /** Slug para construir URLs absolutas. */
  tenantSlug: string | null;
  /** BCC permanente histórico de DTE — preservado por compatibilidad. */
  legacyDteAlwaysBcc: string[];
  modules: Record<EmailModule, ModuleRouting>;
}

const routingCache = new Map<string, { routing: TenantEmailRouting; ts: number }>();

export function clearTenantEmailRoutingCache(tenantId: string): void {
  routingCache.delete(tenantId);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(csv: string): string[] {
  return csv
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && EMAIL_RE.test(e));
}

/**
 * Resuelve el routing de correos por módulo para un tenant.
 * Aplica cascada de fallback en cada módulo.
 *
 * IMPORTANTE: Esta función SIEMPRE retorna un objeto válido.
 * Si el tenant no tiene nada configurado, cada módulo retorna { bcc: [], replyTo: global || "" }.
 */
export async function getTenantEmailRouting(tenantId: string): Promise<TenantEmailRouting> {
  const cached = routingCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.routing;

  const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
  const { prisma } = await import("@/lib/prisma");
  const cfg = await getTenantCompanyConfig(tenantId);

  const [tenant, dteCfg] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    prisma.tenantDteConfig.findUnique({
      where: { tenantId },
      select: { alwaysBcc: true, fromName: true, replyTo: true },
    }),
  ]);

  let from = cfg.emailFrom;
  if (dteCfg?.fromName && dteCfg.fromName.trim().length > 0) {
    const match = cfg.emailFrom.match(/<([^>]+)>/);
    const address = match?.[1] ?? cfg.emailFrom;
    from = `${dteCfg.fromName.trim()} <${address}>`;
  }

  const replyToGlobal = (dteCfg?.replyTo?.trim() || cfg.emailReplyTo || "").trim();
  const legacyDteAlwaysBcc = (dteCfg?.alwaysBcc ?? [])
    .map((e) => e?.trim() ?? "")
    .filter((e) => EMAIL_RE.test(e));

  function resolveModule(
    enabled: string,
    explicitEmails: string,
    replyToOverride: string,
    fallbackEmails: string[],
  ): ModuleRouting {
    const isEnabled = enabled !== "false"; // default true si nunca se configuró
    let bcc: string[] = [];
    if (isEnabled) {
      const explicit = parseEmailList(explicitEmails);
      if (explicit.length > 0) {
        bcc = explicit;
      } else {
        const firstNonEmpty = fallbackEmails.find((e) => e && EMAIL_RE.test(e));
        if (firstNonEmpty) bcc = [firstNonEmpty];
      }
    }
    const replyTo = replyToOverride.trim() || replyToGlobal;
    return { bcc, replyTo };
  }

  const modules: Record<EmailModule, ModuleRouting> = {
    commercial: resolveModule(
      cfg.ccoCommercialEnabled,
      cfg.ccoCommercialEmails,
      cfg.ccoCommercialReplyTo,
      [cfg.email, cfg.emailReplyTo],
    ),
    operations: resolveModule(
      cfg.ccoOperationsEnabled,
      cfg.ccoOperationsEmails,
      cfg.ccoOperationsReplyTo,
      [cfg.emailOps, cfg.email, cfg.emailReplyTo],
    ),
    finance: resolveModule(
      cfg.ccoFinanceEnabled,
      cfg.ccoFinanceEmails,
      cfg.ccoFinanceReplyTo,
      [...legacyDteAlwaysBcc, cfg.emailFinance, cfg.emailReplyTo],
    ),
    system: resolveModule(
      cfg.ccoSystemEnabled,
      cfg.ccoSystemEmails,
      cfg.ccoSystemReplyTo,
      [cfg.emailContact, cfg.email, cfg.emailReplyTo],
    ),
  };

  const routing: TenantEmailRouting = {
    from,
    replyToGlobal,
    tenantSlug: tenant?.slug ?? null,
    legacyDteAlwaysBcc,
    modules,
  };

  routingCache.set(tenantId, { routing, ts: Date.now() });
  return routing;
}
