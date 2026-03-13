/**
 * API Route: /api/public/config
 * GET - Obtener configuración pública para formularios web
 * 
 * Retorna industrias, tipos de servicio y puestos de trabajo
 * para que los formularios web puedan poblar sus dropdowns.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SERVICE_TYPES, WEEKDAYS } from "@/lib/constants";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300", // 5 min cache
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    // Fetch active puestos de trabajo and industries from catalogs
    const [puestos, industries] = await Promise.all([
      prisma.cpqPuestoTrabajo.findMany({
        where: { active: true, tenantId: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.crmIndustry.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          industries: industries.map((i) => ({ value: i.name, label: i.name })),
          serviceTypes: SERVICE_TYPES,
          weekdays: WEEKDAYS,
          puestos: puestos.map((p) => ({ value: p.name, label: p.name })),
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error fetching public config:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración" },
      { status: 500, headers: corsHeaders }
    );
  }
}
