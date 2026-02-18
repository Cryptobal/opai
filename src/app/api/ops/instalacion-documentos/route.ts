/**
 * API: /api/ops/instalacion-documentos
 * GET  - Lista de documentos de instalación (para visitas de supervisión)
 * POST - Guardar lista (code, label, required por documento)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/rbac";
import {
  getInstalacionDocumentTypes,
  setInstalacionDocumentTypes,
  type InstalacionDocumentItem,
} from "@/lib/instalacion-documentos";
import { z } from "zod";

const postBodySchema = z.object({
  documents: z.array(
    z.object({
      code: z.string().min(1).max(80),
      label: z.string().min(1).max(120),
      required: z.boolean(),
    })
  ),
});

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    if (!hasPermission(ctx.userRole as Role, PERMISSIONS.MANAGE_SETTINGS)) {
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const documents = await getInstalacionDocumentTypes(ctx.tenantId);
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("[OPS] Error fetching instalacion documents:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documentos de instalación" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    if (!hasPermission(ctx.userRole as Role, PERMISSIONS.MANAGE_SETTINGS)) {
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const raw = await request.json();
    const parsed = postBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 400 }
      );
    }
    const items: InstalacionDocumentItem[] = parsed.data.documents.map((d) => ({
      code: d.code.trim(),
      label: d.label.trim(),
      required: d.required,
    }));
    const saved = await setInstalacionDocumentTypes(items, ctx.tenantId);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error("[OPS] Error saving instalacion documents:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar documentos de instalación" },
      { status: 500 }
    );
  }
}
