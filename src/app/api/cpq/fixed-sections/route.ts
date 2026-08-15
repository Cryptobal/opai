/**
 * GET/PUT /api/cpq/fixed-sections
 * Biblioteca de secciones fijas institucionales + indicadores publicables.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  ensureFixedSectionsSeeded,
  getProposalIndicators,
  listFixedSections,
  saveProposalIndicators,
  upsertFixedSection,
  type ProposalIndicator,
} from "@/lib/cpq/fixed-sections";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    await ensureFixedSectionsSeeded(ctx.tenantId);
    const [sections, indicators] = await Promise.all([
      listFixedSections(ctx.tenantId),
      getProposalIndicators(ctx.tenantId),
    ]);

    return NextResponse.json({
      success: true,
      data: { sections, indicators },
    });
  } catch (error) {
    console.error("[cpq/fixed-sections GET]", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "save_section";

    if (action === "save_indicators") {
      const raw = Array.isArray(body.indicators) ? body.indicators : [];
      const indicators = raw as ProposalIndicator[];
      const saved = await saveProposalIndicators(ctx.tenantId, indicators);
      return NextResponse.json({ success: true, data: { indicators: saved } });
    }

    if (action === "reorder") {
      const order = Array.isArray(body.order)
        ? body.order.filter((x): x is string => typeof x === "string")
        : [];
      for (let i = 0; i < order.length; i++) {
        await prisma.cpqFixedSection.updateMany({
          where: { id: order[i], tenantId: ctx.tenantId },
          data: { sortOrder: (i + 1) * 10 },
        });
      }
      const sections = await listFixedSections(ctx.tenantId);
      return NextResponse.json({ success: true, data: { sections } });
    }

    const key = typeof body.key === "string" ? body.key.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    if (!key || !title) {
      return NextResponse.json({ success: false, error: "key y title son requeridos" }, { status: 400 });
    }
    const saved = await upsertFixedSection(ctx.tenantId, {
      key,
      title,
      content,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
    });
    return NextResponse.json({ success: true, data: { section: saved } });
  } catch (error) {
    console.error("[cpq/fixed-sections PUT]", error);
    return NextResponse.json({ success: false, error: "No se pudo guardar" }, { status: 500 });
  }
}
