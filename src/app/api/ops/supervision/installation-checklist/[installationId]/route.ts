import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { installationId: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { installationId } = await params;

    const defaults = [
      { id: "default-directiva", name: "Directiva de funcionamiento", category: "documents", isMandatory: true, sortOrder: 0 },
      { id: "default-contrato", name: "Contrato de guardias al día", category: "documents", isMandatory: true, sortOrder: 1 },
      { id: "default-os10", name: "OS10 de los guardias", category: "documents", isMandatory: true, sortOrder: 2 },
      { id: "default-libro", name: "Libro de novedades", category: "documents", isMandatory: true, sortOrder: 3 },
    ];

    let items: unknown[] = [];
    try {
      items = await prisma.opsInstallationChecklistItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          isActive: true,
        },
        orderBy: { sortOrder: "asc" },
      });
    } catch (tableErr: unknown) {
      // P2021: table does not exist — migration not applied yet, use defaults
      const code = tableErr && typeof tableErr === "object" && "code" in tableErr ? (tableErr as { code: string }).code : "";
      if (code !== "P2021") throw tableErr;
    }

    // If no custom items or table doesn't exist, return defaults
    if (items.length === 0) {
      return NextResponse.json({ success: true, data: defaults, isDefault: true });
    }

    return NextResponse.json({ success: true, data: items, isDefault: false });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching checklist items:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los items del checklist" },
      { status: 500 },
    );
  }
}
