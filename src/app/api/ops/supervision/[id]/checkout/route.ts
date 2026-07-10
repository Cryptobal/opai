import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/marcacion";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';
import { canEdit, hasCapability } from "@/lib/permissions";

type Params = { id: string };

const checkoutSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  completedVia: z.enum(["hub", "ops_supervision", "mobile"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const modCheck = await requireTenantModule('ops_supervision');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "ops", "supervision") || !hasCapability(perms, "supervision_checkin")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para cerrar visitas de supervisión" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const canViewAll = hasCapability(perms, "supervision_view_all");
    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        ...(canViewAll ? {} : { supervisorId: ctx.userId }),
      },
      include: {
        installation: {
          select: { lat: true, lng: true, geoRadiusM: true },
        },
      },
    });

    if (!visit) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 },
      );
    }

    if (visit.status === "completed") {
      return NextResponse.json(
        { success: false, error: "La visita ya está cerrada" },
        { status: 409 },
      );
    }

    const bodyRaw = await request.json();
    const parsed = checkoutSchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    let checkOutGeoValidada: boolean | null = null;
    let checkOutDistanciaM: number | null = null;

    if (visit.installation.lat != null && visit.installation.lng != null) {
      checkOutDistanciaM = Math.round(
        haversineDistance(body.lat, body.lng, visit.installation.lat, visit.installation.lng),
      );
      checkOutGeoValidada = checkOutDistanciaM <= visit.installation.geoRadiusM;
    }

    const checkOutAt = new Date();
    const durationMinutes = Math.max(
      0,
      Math.round((checkOutAt.getTime() - visit.checkInAt.getTime()) / 60000),
    );

    const updated = await prisma.opsVisitaSupervision.update({
      where: { id: visit.id },
      data: {
        checkOutAt,
        checkOutLat: body.lat,
        checkOutLng: body.lng,
        checkOutGeoValidada,
        checkOutDistanciaM,
        durationMinutes,
        status: "completed",
        completedVia: body.completedVia ?? "ops_supervision",
      },
    });

    // Tarjeta "Cierre de supervisión" al canal Slack puenteado de la instalación.
    // Fire-and-forget, best-effort: NUNCA debe hacer fallar el checkout.
    void (async () => {
      try {
        const full = await prisma.opsVisitaSupervision.findUnique({
          where: { id: visit.id },
          include: {
            supervisor: { select: { name: true } },
            installation: { select: { name: true } },
            findings: {
              where: { status: "open" },
              orderBy: { createdAt: "desc" },
              select: { severity: true, description: true },
            },
            images: { select: { publicUrl: true } },
            photos: { select: { photoUrl: true } },
          },
        });
        if (!full) return;

        const allPhotos = [
          ...full.images.map((i) => i.publicUrl),
          ...full.photos.map((p) => p.photoUrl),
        ].filter((u): u is string => Boolean(u));
        const dedupedPhotos = [...new Set(allPhotos)];

        const { buildSupervisionCierreBlocks } = await import(
          "@/lib/integrations/slack/supervision-cierre-blocks"
        );
        const { publishSupervisionCierreCard } = await import(
          "@/lib/integrations/slack/supervision-cierre-publish"
        );
        const { getCanonicalSiteUrl } = await import("@/lib/emails/site-url");

        const card = buildSupervisionCierreBlocks({
          installationName: full.installation.name,
          supervisorName: full.supervisor.name ?? "Supervisor",
          checkInAt: updated.checkInAt,
          checkOutAt: updated.checkOutAt ?? checkOutAt,
          durationMinutes: updated.durationMinutes,
          checkInGeoValidada: updated.checkInGeoValidada,
          checkInDistanciaM: updated.checkInDistanciaM,
          checkOutGeoValidada: updated.checkOutGeoValidada,
          checkOutDistanciaM: updated.checkOutDistanciaM,
          installationState: updated.installationState,
          guardsFound: updated.guardsFound,
          guardsExpected: updated.guardsExpected,
          healthScore: updated.healthScore,
          generalComments: updated.generalComments,
          findings: full.findings,
          photoUrls: dedupedPhotos.slice(0, 6),
          totalPhotoCount: dedupedPhotos.length,
          reportUrl: `${getCanonicalSiteUrl()}/ops/supervision/${visit.id}`,
        });
        await publishSupervisionCierreCard(ctx.tenantId, full.installationId, card);
      } catch (err) {
        console.error("[SUPERVISION] Slack cierre card error:", err);
      }
    })();

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error checkout visit:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cerrar la visita de supervisión" },
      { status: 500 },
    );
  }
}
