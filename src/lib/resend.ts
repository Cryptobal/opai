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

/** @deprecated — Usar getTenantCompanyConfig(tenantId) de @/lib/tenant-config */
export const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || 'OPAI <opai@gard.cl>',
  replyTo: process.env.EMAIL_REPLY_TO || 'comercial@gard.cl',
  companyName: 'Gard Security',
};

export interface TenantEmailConfig {
  from: string;
  replyTo: string;
}

const tenantEmailCache = new Map<string, { config: TenantEmailConfig; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function clearTenantEmailConfigCache(tenantId: string): void {
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

    const config: TenantEmailConfig = {
      from: cfg.emailFrom,
      replyTo: cfg.emailReplyTo,
    };

    tenantEmailCache.set(tenantId, { config, ts: Date.now() });
    return config;
  } catch {
    return { from: EMAIL_CONFIG.from, replyTo: EMAIL_CONFIG.replyTo };
  }
}
