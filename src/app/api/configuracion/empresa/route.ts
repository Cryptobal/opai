import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearTenantEmailConfigCache } from "@/lib/resend";
import { clearTenantCompanyConfigCache } from "@/lib/tenant-config";
import { clearTenantTwilioConfigCache, twilioSettingKey } from "@/lib/twilio-config";

const EMPRESA_KEYS = [
  "empresa.razonSocial",
  "empresa.rut",
  "empresa.direccion",
  "empresa.comuna",
  "empresa.ciudad",
  "empresa.telefono",
  "empresa.repLegalNombre",
  "empresa.repLegalRut",
  "empresa.repLegalFirma",
  "empresa.autoFirmaRepLegalContratos",
  "empresa.emailFrom",
  "empresa.emailFromName",
  "empresa.emailReplyTo",
  // Nuevos campos para multi-tenant
  "empresa.companyName",
  "empresa.commercialName",
  "empresa.brandNameUpper",
  "empresa.website",
  "empresa.logoUrl",
  "empresa.email",
  "empresa.emailOps",
  "empresa.emailContact",
  "empresa.phone",
  "empresa.phoneRaw",
  "empresa.whatsappLink",
  // Portales (rondas/acceso)
  "portales.logoutPin",
  // Branding / Imagen corporativa
  "empresa.branding.logoFull",
  "empresa.branding.logoIcon",
  "empresa.branding.logoWhite",
  "empresa.branding.logoDark",
  "empresa.branding.favicon",
  "empresa.branding.primaryColor",
  "empresa.branding.secondaryColor",
  "empresa.branding.accentColor",
  "empresa.branding.appName",
  "empresa.branding.tagline",
];

function settingKey(tenantId: string, key: string): string {
  return `empresa:${tenantId}:${key}`;
}

/** Claves virtuales en GET/PATCH que mapean a `Setting` `twilio:<tenantId>:*` */
const TWILIO_UI = {
  whatsappFrom: "empresa.twilioWhatsappFrom",
  contentSid: "empresa.twilioContentSid",
  whatsappEnabled: "empresa.twilioWhatsappEnabled",
} as const;

function displayWhatsappFrom(stored: string | null | undefined): string {
  if (!stored?.trim()) return "";
  return stored.trim().replace(/^whatsapp:/i, "");
}

function normalizeTwilioWhatsappFrom(input: string): string {
  const t = input.trim();
  if (!t) return "";
  if (t.toLowerCase().startsWith("whatsapp:")) return t;
  const digits = t.replace(/[\s\-]/g, "");
  const withPlus = digits.startsWith("+") ? digits : `+${digits.replace(/^\+/, "")}`;
  return `whatsapp:${withPlus}`;
}

/**
 * GET /api/configuracion/empresa — Get company settings (por tenant)
 * Soporta keys nuevas (empresa:tenantId:empresa.xxx) y antiguas (empresa.xxx) para migración.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const newKeys = EMPRESA_KEYS.map((k) => settingKey(ctx.tenantId, k));
    let settings = await prisma.setting.findMany({
      where: { tenantId: ctx.tenantId, key: { in: newKeys } },
    });

    if (settings.length === 0) {
      settings = await prisma.setting.findMany({
        where: { tenantId: ctx.tenantId, key: { in: EMPRESA_KEYS } },
      });
    }

    const data: Record<string, string> = {};
    for (const s of settings) {
      const shortKey = s.key.includes(":") ? s.key.replace(`empresa:${ctx.tenantId}:`, "") : s.key;
      data[shortKey] = s.value;
    }

    const tid = ctx.tenantId;
    const twilioKeys = [
      twilioSettingKey(tid, "whatsappFrom"),
      twilioSettingKey(tid, "contentSid"),
      twilioSettingKey(tid, "whatsappEnabled"),
    ];
    const twilioRows = await prisma.setting.findMany({
      where: { tenantId: tid, key: { in: twilioKeys } },
    });
    const twByKey = new Map(twilioRows.map((r) => [r.key, r.value]));
    data[TWILIO_UI.whatsappFrom] = displayWhatsappFrom(
      twByKey.get(twilioSettingKey(tid, "whatsappFrom")),
    );
    data[TWILIO_UI.contentSid] = twByKey.get(twilioSettingKey(tid, "contentSid"))?.trim() ?? "";
    data[TWILIO_UI.whatsappEnabled] =
      twByKey.get(twilioSettingKey(tid, "whatsappEnabled")) ?? "true";

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[CONFIG] Error loading empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar la configuración" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/configuracion/empresa — Update company settings (por tenant)
 * Body: { "empresa.razonSocial": "...", "empresa.emailFrom": "...", ... }
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden modificar esta configuración" },
        { status: 403 }
      );
    }

    const body = await request.json();

    for (const shortKey of EMPRESA_KEYS) {
      if (body[shortKey] !== undefined) {
        const key = settingKey(ctx.tenantId, shortKey);
        await prisma.setting.upsert({
          where: { key },
          create: {
            key,
            value: String(body[shortKey]),
            type: "string",
            category: "empresa",
            tenantId: ctx.tenantId,
          },
          update: {
            value: String(body[shortKey]),
          },
        });
      }
    }

    let twilioUpdated = false;
    const tid = ctx.tenantId;

    if (body[TWILIO_UI.whatsappFrom] !== undefined) {
      const normalized = normalizeTwilioWhatsappFrom(String(body[TWILIO_UI.whatsappFrom]));
      const key = twilioSettingKey(tid, "whatsappFrom");
      await prisma.setting.upsert({
        where: { key },
        create: {
          key,
          value: normalized,
          type: "string",
          category: "twilio",
          tenantId: tid,
        },
        update: { value: normalized },
      });
      twilioUpdated = true;
    }

    if (body[TWILIO_UI.contentSid] !== undefined) {
      const key = twilioSettingKey(tid, "contentSid");
      const v = String(body[TWILIO_UI.contentSid]).trim();
      await prisma.setting.upsert({
        where: { key },
        create: {
          key,
          value: v,
          type: "string",
          category: "twilio",
          tenantId: tid,
        },
        update: { value: v },
      });
      twilioUpdated = true;
    }

    if (body[TWILIO_UI.whatsappEnabled] !== undefined) {
      const raw = body[TWILIO_UI.whatsappEnabled];
      const boolStr =
        raw === true || raw === "true" || raw === "1" ? "true" : "false";
      const key = twilioSettingKey(tid, "whatsappEnabled");
      await prisma.setting.upsert({
        where: { key },
        create: {
          key,
          value: boolStr,
          type: "string",
          category: "twilio",
          tenantId: tid,
        },
        update: { value: boolStr },
      });
      twilioUpdated = true;
    }

    if (twilioUpdated) {
      clearTenantTwilioConfigCache(tid);
    }

    clearTenantEmailConfigCache(ctx.tenantId);
    clearTenantCompanyConfigCache(ctx.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CONFIG] Error updating empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la configuración" },
      { status: 500 }
    );
  }
}
