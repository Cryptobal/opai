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

export const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || 'OPAI <opai@gard.cl>',
  replyTo: process.env.EMAIL_REPLY_TO || 'opai@gard.cl',
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
 * Lee de Settings (empresa.emailFrom, etc.) con cache de 5min.
 * Si no hay config en BD, usa los defaults de EMAIL_CONFIG (env vars).
 */
export async function getTenantEmailConfig(tenantId: string): Promise<TenantEmailConfig> {
  const cached = tenantEmailCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.config;

  try {
    const { prisma } = await import("@/lib/prisma");
    const newKeys = [
      `empresa:${tenantId}:empresa.emailFrom`,
      `empresa:${tenantId}:empresa.emailFromName`,
      `empresa:${tenantId}:empresa.emailReplyTo`,
    ];
    let settings = await prisma.setting.findMany({
      where: { tenantId, key: { in: newKeys } },
    });
    if (settings.length === 0) {
      settings = await prisma.setting.findMany({
        where: { tenantId, key: { in: ["empresa.emailFrom", "empresa.emailFromName", "empresa.emailReplyTo"] } },
      });
    }

    const map = new Map(
      settings.map((s) => [
        s.key.includes(":") ? s.key.replace(`empresa:${tenantId}:`, "") : s.key,
        s.value,
      ])
    );
    const emailAddr = map.get("empresa.emailFrom");
    const emailName = map.get("empresa.emailFromName");
    const replyTo = map.get("empresa.emailReplyTo");

    const from = emailAddr
      ? emailName
        ? `${emailName} <${emailAddr}>`
        : emailAddr
      : EMAIL_CONFIG.from;

    const config: TenantEmailConfig = {
      from,
      replyTo: replyTo || EMAIL_CONFIG.replyTo,
    };

    tenantEmailCache.set(tenantId, { config, ts: Date.now() });
    return config;
  } catch {
    return { from: EMAIL_CONFIG.from, replyTo: EMAIL_CONFIG.replyTo };
  }
}
