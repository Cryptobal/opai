import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";

const DEFAULT_ITEMS = [
  // Categoría: Alimentación
  { name: "Alimentación", code: "ALM", category: "Alimentación" },
  { name: "Colación equipo", code: "COL", category: "Alimentación" },
  { name: "Café / bebidas", code: "CAF", category: "Alimentación" },

  // Categoría: Transporte
  { name: "Combustible", code: "CMB", category: "Transporte" },
  { name: "Estacionamiento", code: "EST", category: "Transporte" },
  { name: "Peaje", code: "PEA", category: "Transporte" },
  { name: "Taxi / transporte app", code: "TAX", category: "Transporte" },
  { name: "Pasajes transporte público", code: "PTP", category: "Transporte" },

  // Categoría: Equipamiento
  { name: "Uniforme", code: "UNI", category: "Equipamiento" },
  { name: "Herramientas", code: "HER", category: "Equipamiento" },
  { name: "EPP (Elementos de protección)", code: "EPP", category: "Equipamiento" },

  // Categoría: Materiales
  { name: "Materiales de oficina", code: "MOF", category: "Materiales" },
  { name: "Materiales de limpieza", code: "MLI", category: "Materiales" },
  { name: "Insumos operativos", code: "INS", category: "Materiales" },

  // Categoría: Servicios
  { name: "Telefonía / internet", code: "TEL", category: "Servicios" },
  { name: "Impresiones / copias", code: "IMP", category: "Servicios" },
  { name: "Courier / envíos", code: "COU", category: "Servicios" },

  // Categoría: Otros
  { name: "Gastos médicos", code: "MED", category: "Otros" },
  { name: "Capacitación", code: "CAP", category: "Otros" },
  { name: "Otros gastos", code: "OTR", category: "Otros" },
];

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    let created = 0;
    let skipped = 0;

    for (const item of DEFAULT_ITEMS) {
      const existing = await prisma.financeRendicionItem.findFirst({
        where: { tenantId: ctx.tenantId, name: item.name },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.financeRendicionItem.create({
        data: {
          tenantId: ctx.tenantId,
          name: item.name,
          code: item.code,
          category: item.category,
          active: true,
        },
      });
      created++;
    }

    // Also ensure config exists with requireImage = false by default
    await prisma.financeRendicionConfig.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        requireImage: false,
        requireObservations: false,
      },
      update: {},
    });

    return NextResponse.json({
      success: true,
      message: `${created} ítems creados, ${skipped} ya existían`,
    });
  } catch (error) {
    console.error("[Finance] Error seeding items:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear ítems por defecto" },
      { status: 500 },
    );
  }
}
