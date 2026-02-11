/**
 * API Route: /api/cpq/settings
 * GET - Obtener parámetros globales CPQ
 * PUT - Guardar parámetros globales CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";

const KEY_PREFIX = "cpq.";
const DEFAULTS = {
  monthlyHoursStandard: 180,
  avgStayMonths: 4,
  uniformChangesPerYear: 3,
  holidayAnnualCount: 16,
  holidayCompensationFactor: 1.7,
  holidayCommercialBufferPct: 10,
};

const buildKey = (key: keyof typeof DEFAULTS) => `${KEY_PREFIX}${key}`;

export async function GET() {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const keys = Object.keys(DEFAULTS).map((key) => buildKey(key as keyof typeof DEFAULTS));
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: keys },
        tenantId,
      },
    });

    const data = { ...DEFAULTS } as Record<string, number>;
    for (const setting of settings) {
      const rawKey = setting.key.replace(KEY_PREFIX, "");
      const value = Number(setting.value);
      if (!Number.isNaN(value)) data[rawKey] = value;
    }

    const holidayMonthlyFactor = (data.holidayAnnualCount || 0) / 12;
    const holidayCommercialFactor = 1 + (data.holidayCommercialBufferPct || 0) / 100;
    const holidayTotalFactor =
      0.5 * holidayMonthlyFactor * (data.holidayCompensationFactor || 0) * holidayCommercialFactor;

    return NextResponse.json({
      success: true,
      data: {
        ...data,
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
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    const entries = Object.keys(DEFAULTS).map((key) => {
      const value = body?.[key] ?? DEFAULTS[key as keyof typeof DEFAULTS];
      return { key, value };
    });

    await prisma.$transaction(
      entries.map((entry) =>
        prisma.setting.upsert({
          where: { key: buildKey(entry.key as keyof typeof DEFAULTS) },
          update: {
            value: String(entry.value ?? 0),
            type: "number",
            category: "cpq",
            tenantId,
          },
          create: {
            key: buildKey(entry.key as keyof typeof DEFAULTS),
            value: String(entry.value ?? 0),
            type: "number",
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
