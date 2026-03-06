import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateRut, cleanRut } from "@/lib/access-control/utils";
import type { ListImportResult } from "@/lib/access-control/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const body = await request.json();
    const { rows, listType, createdBy } = body as {
      rows: Array<{
        rut: string;
        fullName: string;
        company?: string;
        blockReason?: string;
        validFrom?: string;
        validUntil?: string;
      }>;
      listType: "whitelist" | "blacklist";
      createdBy?: string;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se proporcionaron datos para importar" },
        { status: 400 }
      );
    }

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const result: ListImportResult = { total: rows.length, imported: 0, errors: [] };

    const validEntries: Array<{
      tenantId: string;
      installationId: string;
      listType: string;
      rut: string;
      fullName: string;
      company: string | null;
      blockReason: string | null;
      scope: string;
      validFrom: Date | null;
      validUntil: Date | null;
      allowedDays: number[];
      isActive: boolean;
      createdBy: string | null;
      updatedAt: Date;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (!row.rut) {
        result.errors.push({ row: i + 1, rut: row.rut || "", error: "RUT vacío" });
        continue;
      }

      if (!validateRut(row.rut)) {
        result.errors.push({ row: i + 1, rut: row.rut, error: "RUT inválido (módulo 11)" });
        continue;
      }

      if (!row.fullName || row.fullName.trim().length === 0) {
        result.errors.push({ row: i + 1, rut: row.rut, error: "Nombre vacío" });
        continue;
      }

      validEntries.push({
        tenantId: installation.tenantId,
        installationId,
        listType,
        rut: cleanRut(row.rut),
        fullName: row.fullName.trim(),
        company: row.company?.trim() || null,
        blockReason: row.blockReason?.trim() || null,
        scope: "local",
        validFrom: row.validFrom ? new Date(row.validFrom) : null,
        validUntil: row.validUntil ? new Date(row.validUntil) : null,
        allowedDays: [],
        isActive: true,
        createdBy: createdBy || null,
        updatedAt: new Date(),
      });
    }

    if (validEntries.length > 0) {
      await prisma.accessControlList.createMany({
        data: validEntries,
      });
      result.imported = validEntries.length;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[AccessControl] Error importing list:", error);
    return NextResponse.json(
      { success: false, error: "Error al importar lista" },
      { status: 500 }
    );
  }
}
