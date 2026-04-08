/**
 * GET /api/ops/search
 * Búsqueda global en Ops: guardias por nombre, código o RUT,
 * e instalaciones → enlace a pauta mensual activa.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

const GUARDIA_LIMIT = 8;
const INSTALLATION_LIMIT = 5;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const contains = { contains: q, mode: "insensitive" as const };
    const searchNorm = q.replace(/[.\s-]/g, "");

    // ── Guardias (nombre, código, RUT) ──
    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { persona: { firstName: contains } },
          { persona: { lastName: contains } },
          { persona: { rut: { contains: searchNorm, mode: "insensitive" } } },
          { code: contains },
        ],
      },
      take: GUARDIA_LIMIT,
      select: {
        id: true,
        code: true,
        marcacionPin: true,
        persona: {
          select: {
            firstName: true,
            lastName: true,
            rut: true,
          },
        },
        currentInstallation: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: {
      id: string;
      type: "guardia" | "pauta_mensual";
      title: string;
      subtitle?: string;
      href: string;
      pinDisplay?: string;
    }[] = [];

    for (const g of guardias) {
      // Formato: "Apellido(s), PrimerNombre"
      const primerNombre = g.persona.firstName?.trim().split(/\s+/)[0] ?? "";
      const apellidos = g.persona.lastName?.trim() ?? "";
      const title = apellidos
        ? `${apellidos}${primerNombre ? `, ${primerNombre}` : ""}`
        : (g.persona.firstName ?? "").trim() || "Guardia";

      // Ley 21.719: el PIN no se expone en búsqueda. Solo se indica si está configurado.
      const pinDisplay = g.marcacionPin ? "PIN configurado" : "Sin PIN";

      const subtitleParts = [
        g.currentInstallation?.name,
        g.persona.rut ?? "",
      ].filter(Boolean);

      data.push({
        id: g.id,
        type: "guardia" as const,
        title,
        subtitle: subtitleParts.join(" · ") || undefined,
        href: `/personas/guardias/${g.id}`,
        pinDisplay,
      });
    }

    // ── Instalaciones → Pauta mensual del mes en curso ──
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    const MESES = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];

    const installations = await prisma.crmInstallation.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "active",
        OR: [
          { name: contains },
          { address: contains },
          { commune: contains },
          { city: contains },
        ],
      },
      take: INSTALLATION_LIMIT,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        account: { select: { name: true } },
      },
    });

    for (const inst of installations) {
      data.push({
        id: `pauta-${inst.id}`,
        type: "pauta_mensual" as const,
        title: `Pauta mensual · ${inst.name}`,
        subtitle: [
          `${MESES[currentMonth - 1]} ${currentYear}`,
          inst.account?.name,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/ops/pauta-mensual?installationId=${inst.id}`,
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[ops/search] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error en la búsqueda" },
      { status: 500 }
    );
  }
}
