/**
 * API Route: /api/cpq/settings
 * GET - Obtener parámetros globales CPQ
 * PUT - Guardar parámetros globales CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from '@/lib/require-module';

const KEY_PREFIX = "cpq.";
const NUMERIC_DEFAULTS: Record<string, number> = {
  monthlyHoursStandard: 180,
  avgStayMonths: 4,
  uniformChangesPerYear: 3,
  holidayAnnualCount: 12,
  holidayCommercialBufferPct: 10,
  defaultMarginPct: 13,
};
const STRING_DEFAULTS: Record<string, string> = {
  defaultMarginMode: "sobre_venta",
  defaultProposalTemplateId: "",
};
const DEFAULTS = { ...NUMERIC_DEFAULTS };

const buildKey = (key: string) => `${KEY_PREFIX}${key}`;

export async function GET() {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;
    const tenantId = ctx.tenantId;
    const allKeys = [...Object.keys(NUMERIC_DEFAULTS), ...Object.keys(STRING_DEFAULTS)].map(buildKey);
    const settings = await prisma.setting.findMany({
      where: { key: { in: allKeys }, tenantId },
    });

    const numData = { ...NUMERIC_DEFAULTS } as Record<string, number>;
    const strData = { ...STRING_DEFAULTS } as Record<string, string>;
    for (const setting of settings) {
      const rawKey = setting.key.replace(KEY_PREFIX, "");
      if (rawKey in NUMERIC_DEFAULTS) {
        const value = Number(setting.value);
        if (!Number.isNaN(value)) numData[rawKey] = value;
      } else if (rawKey in STRING_DEFAULTS) {
        strData[rawKey] = setting.value ?? STRING_DEFAULTS[rawKey];
      }
    }

    const holidayMonthlyFactor = (numData.holidayAnnualCount || 0) / 12;
    const holidayCommercialFactor = 1 + (numData.holidayCommercialBufferPct || 0) / 100;
    const holidayTotalFactor = 0.5 * holidayMonthlyFactor * holidayCommercialFactor;

    return NextResponse.json({
      success: true,
      data: {
        ...numData,
        ...strData,
        holidayMonthlyFactor,
        holidayCommercialFactor,
        holidayTotalFactor,
      },
    });
  } catch (error) {
    console.error("Error fetching CPQ settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;
    const tenantId = ctx.tenantId;
    const body = await request.json();

    const numericEntries = Object.keys(NUMERIC_DEFAULTS).map((key) => ({
      key,
      value: String(body?.[key] ?? NUMERIC_DEFAULTS[key]),
      type: "number" as const,
    }));
    const stringEntries = Object.keys(STRING_DEFAULTS).map((key) => ({
      key,
      value: String(body?.[key] ?? STRING_DEFAULTS[key]),
      type: "string" as const,
    }));
    const allEntries = [...numericEntries, ...stringEntries];

    await prisma.$transaction(
      allEntries.map((entry) =>
        prisma.setting.upsert({
          where: { tenantId_key: { tenantId, key: buildKey(entry.key) } },
          update: {
            value: entry.value,
            type: entry.type,
            category: "cpq",
            tenantId,
          },
          create: {
            key: buildKey(entry.key),
            value: entry.value,
            type: entry.type,
            category: "cpq",
            tenantId,
          },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving CPQ settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
