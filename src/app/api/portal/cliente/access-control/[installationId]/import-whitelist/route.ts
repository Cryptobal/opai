import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";
import { validateRut, cleanRut } from "@/lib/access-control/utils";
import type { ListImportResult } from "@/lib/access-control/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { installationId } = await params;
    if (!(await ensureInstallationAccess(session, installationId))) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const body = await request.json();
    const { rows } = body as {
      rows: Array<{
        rut: string;
        fullName: string;
        company?: string;
        validFrom?: string;
        validUntil?: string;
      }>;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se proporcionaron datos" },
        { status: 400 }
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
        tenantId: session.tenantId,
        installationId,
        listType: "whitelist",
        rut: cleanRut(row.rut),
        fullName: row.fullName.trim(),
        company: row.company?.trim() || null,
        scope: "local",
        validFrom: row.validFrom ? new Date(row.validFrom) : null,
        validUntil: row.validUntil ? new Date(row.validUntil) : null,
        allowedDays: [],
        isActive: true,
        createdBy: session.contactId || null,
        updatedAt: new Date(),
      });
    }

    if (validEntries.length > 0) {
      await prisma.accessControlList.createMany({ data: validEntries });
      result.imported = validEntries.length;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[ClientPortal] Error importing whitelist:", error);
    return NextResponse.json(
      { success: false, error: "Error al importar lista" },
      { status: 500 }
    );
  }
}
