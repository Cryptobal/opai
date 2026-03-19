/**
 * GET /api/finance/guardias-search?q=xxx
 * Búsqueda de guardias activos y usuarios del sistema para asignar como
 * beneficiario de una rendición de tercero.
 * Requiere permiso finance.rendiciones edit.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

const LIMIT = 20;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const qLower = q.toLowerCase();

    // ── Guardias activos ──
    const [guardiasExact, admins] = await Promise.all([
      prisma.opsGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          lifecycleStatus: { in: ["contratado", "seleccionado", "te"] },
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { persona: { firstName: { contains: q, mode: "insensitive" } } },
            { persona: { lastName: { contains: q, mode: "insensitive" } } },
            { persona: { rut: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: LIMIT,
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.admin.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "active",
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: LIMIT,
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // Fallback: client-side filter when DB exact search returns nothing for guardias
    let guardias = guardiasExact;
    if (guardias.length === 0) {
      const allActive = await prisma.opsGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          lifecycleStatus: { in: ["contratado", "seleccionado", "te"] },
        },
        take: 100,
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      const searchable = (g: (typeof allActive)[0]) =>
        `${g.persona?.firstName ?? ""} ${g.persona?.lastName ?? ""} ${g.code ?? ""} ${g.persona?.rut ?? ""}`.toLowerCase();
      guardias = allActive.filter((g) => searchable(g).includes(qLower)).slice(0, LIMIT);
    }

    const guardiaResults = guardias.map((g) => ({
      id: g.id,
      type: "guardia" as const,
      nombreCompleto: `${g.persona?.firstName ?? ""} ${g.persona?.lastName ?? ""}`.trim() || "Sin nombre",
      code: g.code ?? undefined,
      rut: g.persona?.rut ?? undefined,
      email: undefined as string | undefined,
    }));

    const adminResults = admins.map((a) => ({
      id: a.id,
      type: "admin" as const,
      nombreCompleto: a.name || a.email,
      code: undefined as string | undefined,
      rut: undefined as string | undefined,
      email: a.email,
    }));

    // Merge: guardias first, then admins, deduplicate by id, cap at LIMIT
    const seen = new Set<string>();
    const merged = [...guardiaResults, ...adminResults].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).slice(0, LIMIT);

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("[finance/guardias-search] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error en la búsqueda" },
      { status: 500 },
    );
  }
}
