import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { layoutSchema } from "@/lib/camaras/schemas";

async function activeIds(tenantId: string, ids: unknown): Promise<string[]> {
  const raw = Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string") : [];
  if (raw.length === 0) return [];
  const rows = await prisma.opsCamara.findMany({
    where: { tenantId, isActive: true, id: { in: raw } },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  return raw.filter((id) => allowed.has(id));
}

export async function GET() {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const layouts = await prisma.opsCamaraLayout.findMany({
      where: { tenantId: modCheck.ctx.tenantId, userId: modCheck.ctx.userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const data = await Promise.all(
      layouts.map(async (layout) => ({
        ...layout,
        cameraIds: await activeIds(modCheck.ctx.tenantId, layout.cameraIds),
      })),
    );

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[ops/camaras layouts GET]", e);
    return NextResponse.json({ success: false, error: "Error al listar páginas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const parsed = layoutSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const cameraIds = await activeIds(modCheck.ctx.tenantId, parsed.data.cameraIds);
    const row = await prisma.opsCamaraLayout.create({
      data: {
        tenantId: modCheck.ctx.tenantId,
        userId: modCheck.ctx.userId,
        name: parsed.data.name,
        gridSize: parsed.data.gridSize,
        cameraIds,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (e) {
    console.error("[ops/camaras layouts POST]", e);
    return NextResponse.json({ success: false, error: "Error al guardar la página" }, { status: 500 });
  }
}
