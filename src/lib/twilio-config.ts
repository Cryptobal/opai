/**
 * Twilio WhatsApp — config por tenant (una sola cuenta Twilio vía env vars).
 *
 * Cada tenant tiene número remitente y opcionalmente Content SID; credenciales siempre globales.
 */

import Twilio from "twilio";
import { prisma } from "@/lib/prisma";

const TWILIO_KEYS = {
  whatsappFrom: "whatsappFrom",
  contentSid: "contentSid",
  whatsappEnabled: "whatsappEnabled",
} as const;

export function twilioSettingKey(
  tenantId: string,
  field: keyof typeof TWILIO_KEYS,
): string {
  return `twilio:${tenantId}:${TWILIO_KEYS[field]}`;
}

const GLOBAL_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const GLOBAL_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const GLOBAL_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const GLOBAL_CONTENT_SID = process.env.TWILIO_WHATSAPP_CONTENT_SID;

let twilioSingleton: Twilio.Twilio | null = null;

function getTwilioClientSingleton(): Twilio.Twilio | null {
  if (!GLOBAL_ACCOUNT_SID || !GLOBAL_AUTH_TOKEN) {
    return null;
  }
  if (!twilioSingleton) {
    twilioSingleton = Twilio(GLOBAL_ACCOUNT_SID, GLOBAL_AUTH_TOKEN);
  }
  return twilioSingleton;
}

export interface TenantTwilioConfig {
  client: Twilio.Twilio | null;
  /** Ej. whatsapp:+569... */
  from: string | null;
  contentSid: string | null;
  enabled: boolean;
}

const configCache = new Map<string, { cfg: TenantTwilioConfig; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function parseEnabled(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return true;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Resuelve cliente Twilio (singleton) y remitente / template por tenant.
 * Sin credenciales globales: client null. Sin número: fallback a TWILIO_WHATSAPP_FROM.
 */
export async function getTenantTwilioConfig(tenantId: string): Promise<TenantTwilioConfig> {
  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.cfg;
  }

  const client = getTwilioClientSingleton();

  const keys = [
    twilioSettingKey(tenantId, "whatsappFrom"),
    twilioSettingKey(tenantId, "contentSid"),
    twilioSettingKey(tenantId, "whatsappEnabled"),
  ];

  const rows = await prisma.setting.findMany({
    where: { tenantId, key: { in: keys } },
    select: { key: true, value: true },
  });

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const fromStored = byKey.get(twilioSettingKey(tenantId, "whatsappFrom"))?.trim() || null;
  const contentStored = byKey.get(twilioSettingKey(tenantId, "contentSid"))?.trim() || null;
  const enabledRaw = byKey.get(twilioSettingKey(tenantId, "whatsappEnabled"));

  const from = fromStored || GLOBAL_WHATSAPP_FROM || null;
  const contentSid = contentStored || GLOBAL_CONTENT_SID || null;
  const enabled = parseEnabled(enabledRaw);

  const cfg: TenantTwilioConfig = {
    client,
    from,
    contentSid,
    enabled,
  };

  configCache.set(tenantId, { cfg, ts: Date.now() });
  return cfg;
}

export function clearTenantTwilioConfigCache(tenantId?: string): void {
  if (tenantId) configCache.delete(tenantId);
  else configCache.clear();
}

/**
 * true si hay credenciales globales, el tenant tiene WhatsApp habilitado y hay número remitente resuelto.
 */
export async function isTenantWhatsAppSendConfigured(tenantId: string): Promise<boolean> {
  const { client, from, enabled } = await getTenantTwilioConfig(tenantId);
  return !!(client && from && enabled);
}

/**
 * Busca tenant por número remitente WhatsApp (status callback: From = nuestro número).
 * Acepta variantes con/sin prefijo whatsapp:.
 */
export async function findTenantIdByTwilioWhatsAppFrom(
  fromRaw: string | null | undefined,
): Promise<string | null> {
  if (!fromRaw || typeof fromRaw !== "string") return null;

  const trimmed = fromRaw.trim();
  const normalized = trimmed.toLowerCase().startsWith("whatsapp:")
    ? trimmed
    : `whatsapp:${trimmed.replace(/^\+/, "+")}`;

  const candidates = Array.from(new Set([trimmed, normalized]));

  const rows = await prisma.setting.findMany({
    where: {
      AND: [
        { key: { startsWith: "twilio:" } },
        { key: { endsWith: ":whatsappFrom" } },
        { tenantId: { not: null } },
        { value: { in: candidates } },
      ],
    },
    select: { tenantId: true, value: true },
  });

  const row = rows.find((r) => r.tenantId && candidates.includes(r.value.trim()));
  return row?.tenantId ?? null;
}
