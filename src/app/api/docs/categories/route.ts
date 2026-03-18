/**
 * API: /api/docs/categories
 * GET  - Listar categorías por tenant (opcional ?module=)
 * POST - Crear categoría
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireDocsView, requireDocsEdit } from "@/lib/api-auth-docs";
import { z } from "zod";

const createCategorySchema = z.object({
  module: z.string().min(1),
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y _"),
  label: z.string().min(1),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsView(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const module = searchParams.get("module");

    const categories = await prisma.docCategory.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(module ? { module } : {}),
      },
      orderBy: [{ module: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    });

    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    console.error("Error fetching doc categories:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener categorías" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsEdit(ctx);
    if (forbidden) return forbidden;

    if (typeof (prisma as any).docCategory?.findFirst !== "function") {
      console.error("Prisma client missing docCategory. Restart the dev server (npm run dev).");
      return NextResponse.json(
        {
          success: false,
          error:
            "Cliente de base de datos desactualizado. Reinicia el servidor (para el proceso de desarrollo, detén y vuelve a ejecutar npm run dev).",
        },
        { status: 500 }
      );
    }

    const parsed = await parseBody(request, createCategorySchema);
    if (parsed.error) return parsed.error;

    const { module, key, label, sortOrder } = parsed.data;

    const existing = await prisma.docCategory.findFirst({
      where: {
        tenantId: ctx.tenantId,
        module,
        key,
      },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe una categoría con ese módulo y clave" },
        { status: 409 }
      );
    }

    const category = await prisma.docCategory.create({
      data: {
        tenantId: ctx.tenantId,
        module,
        key,
        label,
        sortOrder,
      },
    });

    return NextResponse.json({ success: true, data: category });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; meta?: unknown };
    console.error("Error creating doc category:", err?.code, err?.message, err?.meta);

    let userMessage = "Error al crear categoría";
    if (err?.code === "P2021") {
      userMessage = "La tabla de categorías no existe. Ejecuta: npx prisma migrate deploy";
    } else if (err?.code === "P2002") {
      userMessage = "Ya existe una categoría con ese módulo y clave";
    } else if (typeof err?.message === "string" && err.message.length < 200) {
      userMessage = err.message;
    }

    const body: { success: false; error: string; debug?: string } = {
      success: false,
      error: userMessage,
    };
    if (process.env.NODE_ENV === "development" && typeof err?.message === "string") {
      body.debug = err.message;
    }

    return NextResponse.json(body, { status: 500 });
  }
}
