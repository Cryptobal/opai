import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { buildInstallationDetail } from "@/lib/protocols/knowledge-aggregator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value,
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId requerido" },
        { status: 400 },
      );
    }

    if (!session.installations.some((i) => i.id === installationId)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    if (session.portalConfig?.conocimiento === false) {
      return NextResponse.json(
        { success: false, error: "Sub-tab deshabilitada" },
        { status: 403 },
      );
    }

    const canSeeNames = session.portalConfig?.canSeeGuardNames === true;

    const detail = await buildInstallationDetail(
      session.tenantId,
      installationId,
      {
        anonymize: !canSeeNames,
        includeTrend: true,
        salt: session.tenantId,
      },
    );

    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    // Strip operator-only fields (passingScore, internal IDs, exam IDs).
    // The aggregator already returns nothing of that kind, but we mirror
    // the exact shape contracted by the portal here for clarity.
    const payload = {
      installation: detail.installation,
      protocol: detail.protocol,
      kpis: detail.kpis,
      sectionCompliance: detail.sectionCompliance,
      guards: detail.guards.map((g) => ({
        guardId: g.guardId,
        name: canSeeNames ? g.name : g.initials,
        initials: g.initials,
        shift: g.shift,
        avgScore: g.avgScore,
        lastExamAt: g.lastExamAt,
        pendingCount: g.pendingCount,
        trend: g.trend,
        status: g.status,
        sectionScores: g.sectionScores,
      })),
      alert: detail.alert,
      evaluatedRatio: detail.evaluatedRatio,
      trend: detail.trend ?? [],
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (err) {
    console.error("[portal/cliente/conocimiento]", err);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
