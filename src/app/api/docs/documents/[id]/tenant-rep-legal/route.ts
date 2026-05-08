/**
 * GET /api/docs/documents/[id]/tenant-rep-legal
 *
 * Returns the tenant's own "representante legal" data from Settings
 * (empresa.repLegalNombre / Rut / Email). Used by the signature modal to:
 *   - warn when the email is missing,
 *   - offer a "use my rep legal" quick-fill button for signer 1.
 *
 * Lightweight on purpose: the broader /api/configuracion/empresa returns
 * 40+ keys, and we only need 3.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireDocsView } from "@/lib/api-auth-docs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsView(ctx, "gestion");
    if (forbidden) return forbidden;

    const { id } = await params;
    const doc = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 },
      );
    }

    const empresaKeys = [
      "empresa.repLegalNombre",
      "empresa.repLegalRut",
      "empresa.repLegalEmail",
    ];
    const settingKeys = empresaKeys.flatMap((k) => [
      k,
      `empresa:${ctx.tenantId}:${k}`,
    ]);
    const settings = await prisma.setting.findMany({
      where: { tenantId: ctx.tenantId, key: { in: settingKeys } },
      select: { key: true, value: true },
    });
    const map = new Map<string, string>();
    for (const s of settings) {
      const k = s.key.includes(":")
        ? s.key.replace(`empresa:${ctx.tenantId}:`, "")
        : s.key;
      map.set(k, s.value);
    }

    return NextResponse.json({
      success: true,
      data: {
        name: map.get("empresa.repLegalNombre") ?? "",
        rut: map.get("empresa.repLegalRut") ?? "",
        email: map.get("empresa.repLegalEmail") ?? "",
      },
    });
  } catch (error) {
    console.error("[tenant-rep-legal]", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar config" },
      { status: 500 },
    );
  }
}
