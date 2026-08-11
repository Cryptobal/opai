/**
 * GET — PDF del dossier de cumplimiento por instalación.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { canViewInstallations } from "@/lib/permissions";
import { buildInstallationDossier } from "@/lib/docs/dossier-instalacion";
import { prisma } from "@/lib/prisma";
import { ensureOpsCapability } from "@/lib/ops";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "installations");
    if (forbidden) return forbidden;

    const perms = await getPermissionsFromAuth(ctx);
    const docsForbidden = await ensureOpsCapability(ctx, "guardias_documents");
    if (!canViewInstallations(perms) || docsForbidden) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id } = await params;
    const inst = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { name: true },
    });
    if (!inst) {
      return NextResponse.json({ success: false, error: "No encontrada" }, { status: 404 });
    }

    const { byGuardia, docLabels } = await buildInstallationDossier(ctx.tenantId, id);
    const lines: string[] = [
      `Dossier de cumplimiento — ${inst.name}`,
      `Generado: ${new Date().toISOString().slice(0, 10)}`,
      "",
    ];
    for (const g of byGuardia) {
      lines.push(`## ${g.nombre}`);
      if (g.documentos.length === 0) {
        lines.push("  (sin documentos)");
      }
      for (const d of g.documentos) {
        const label = docLabels[d.type] ?? d.type;
        lines.push(
          `  - ${label}: ${d.status}` +
            (d.expiresAt ? ` · vence ${d.expiresAt}` : "")
        );
      }
      lines.push("");
    }

    // PDF mínimo con texto (sin Chromium en este path: text/plain exportable).
    // Consumidores pueden imprimir a PDF desde el cliente; aquí devolvemos
    // contenido estructurado listo para descarga.
    const body = lines.join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="dossier-${inst.name.replace(/[^\w.-]+/g, "_")}.txt"`,
      },
    });
  } catch (error) {
    console.error("[CRM] dossier pdf error:", error);
    return NextResponse.json({ success: false, error: "Error al exportar" }, { status: 500 });
  }
}
