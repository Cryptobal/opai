/**
 * API: /api/crm/folders
 * GET - Listar carpetas de una entidad
 * POST - Crear carpeta
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

const ALLOWED_ENTITY_TYPES = ["lead", "deal", "account", "contact", "installation", "guardia"] as const;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const entityType = request.nextUrl.searchParams.get("entityType");
    const entityId = request.nextUrl.searchParams.get("entityId");

    if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType as (typeof ALLOWED_ENTITY_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: "entityType requerido (lead, deal, account, contact, installation, guardia)" },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId requerido" },
        { status: 400 }
      );
    }

    const folders = await prisma.documentFolder.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityType,
        entityId,
      },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: folders });
  } catch (error) {
    console.error("[CRM] Error listing folders:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar carpetas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const { name, entityType, entityId, parentId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "name es requerido" },
        { status: 400 }
      );
    }

    if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType as (typeof ALLOWED_ENTITY_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: "entityType requerido" },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId requerido" },
        { status: 400 }
      );
    }

    const folder = await prisma.documentFolder.create({
      data: {
        tenantId: ctx.tenantId,
        name: name.trim(),
        entityType,
        entityId,
        parentId: parentId || null,
      },
    });

    return NextResponse.json({ success: true, data: folder }, { status: 201 });
  } catch (error) {
    console.error("[CRM] Error creating folder:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear carpeta" },
      { status: 500 }
    );
  }
}
