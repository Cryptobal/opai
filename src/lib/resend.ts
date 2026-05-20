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
}

/** Alias semántico de clearTenantEmailConfigCache para callers de config update. */
export function invalidateTenantEmailCache(tenantId: string): void {
  tenantEmailCache.delete(tenantId);
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
