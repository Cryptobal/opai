/**
 * GET/POST /api/payroll/parameters
 * Gestión de versiones de parámetros legales
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PayrollParameters } from "@/modules/payroll/engine";

/**
 * GET /api/payroll/parameters
 * Obtener versiones de parámetros
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const activeOnly = searchParams.get("active_only") !== "false";
    const effectiveDate = searchParams.get("effective_date");

    if (activeOnly) {
      // Solo versión activa
      const activeVersion = await prisma.payrollParameterVersion.findFirst({
        where: { isActive: true },
      });

      if (!activeVersion) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No active parameter version found",
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          current_version: {
            id: activeVersion.id,
            name: activeVersion.name,
            effective_from: activeVersion.effectiveFrom.toISOString().split("T")[0],
            effective_until: activeVersion.effectiveUntil
              ? activeVersion.effectiveUntil.toISOString().split("T")[0]
              : null,
            is_active: activeVersion.isActive,
            data: activeVersion.data,
            created_at: activeVersion.createdAt.toISOString(),
            created_by: activeVersion.createdBy,
          },
        },
      });
    } else if (effectiveDate) {
      // Versión vigente en fecha específica
      const date = new Date(effectiveDate);

      const version = await prisma.payrollParameterVersion.findFirst({
        where: {
          effectiveFrom: { lte: date },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });

      if (!version) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: `No parameter version found for date ${effectiveDate}`,
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          current_version: {
            id: version.id,
            name: version.name,
            effective_from: version.effectiveFrom.toISOString().split("T")[0],
            effective_until: version.effectiveUntil
              ? version.effectiveUntil.toISOString().split("T")[0]
              : null,
            is_active: version.isActive,
            data: version.data,
            created_at: version.createdAt.toISOString(),
            created_by: version.createdBy,
          },
        },
      });
    } else {
      // Todas las versiones
      const versions = await prisma.payrollParameterVersion.findMany({
        orderBy: { effectiveFrom: "desc" },
      });

      return NextResponse.json({
        success: true,
        data: {
          all_versions: versions.map((v) => ({
            id: v.id,
            name: v.name,
            effective_from: v.effectiveFrom.toISOString().split("T")[0],
            effective_until: v.effectiveUntil
              ? v.effectiveUntil.toISOString().split("T")[0]
              : null,
            is_active: v.isActive,
            created_at: v.createdAt.toISOString(),
            created_by: v.createdBy,
          })),
        },
      });
    }
  } catch (error: any) {
    console.error("[PAYROLL] Error fetching parameters:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error.message || "Failed to fetch parameters",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payroll/parameters
 * Crear nueva versión de parámetros
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar campos requeridos
    if (!body.name || !body.effective_from || !body.data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "name, effective_from, and data are required",
          },
        },
        { status: 400 }
      );
    }

    // Validar estructura de data
    const data = body.data as PayrollParameters;

    if (!data.afp || data.afp.base_rate !== 0.1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_DATA_STRUCTURE",
            message: "AFP base_rate must be 0.10",
          },
        },
        { status: 400 }
      );
    }

    if (!data.sis || data.sis.applies_to !== "employer") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_DATA_STRUCTURE",
            message: "SIS must apply to employer",
          },
        },
        { status: 400 }
      );
    }

    // Si set_as_active, desactivar versión actual
    if (body.set_as_active) {
      await prisma.payrollParameterVersion.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    // Crear nueva versión
    const newVersion = await prisma.payrollParameterVersion.create({
      data: {
        name: body.name,
        description: body.description,
        effectiveFrom: new Date(body.effective_from),
        effectiveUntil: body.effective_until ? new Date(body.effective_until) : null,
        data: data as any,
        isActive: body.set_as_active || false,
        createdBy: body.created_by || null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: newVersion.id,
          name: newVersion.name,
          effective_from: newVersion.effectiveFrom.toISOString().split("T")[0],
          is_active: newVersion.isActive,
          created_at: newVersion.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[PAYROLL] Error creating parameter version:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error.message || "Failed to create parameter version",
        },
      },
      { status: 500 }
    );
  }
}
