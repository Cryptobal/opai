import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import {
  marcarEnCamino,
  confirmarLlegada,
  reportarAusencia,
  type ContactoResultado,
} from "@/lib/ops/asistencia-control";

type RouteParams = { params: Promise<{ id: string }> };

const RESULTADOS: ContactoResultado[] = ["no_contesta", "confirmado", "atrasado"];

/**
 * Control de asistencia desde la web — paridad con Slack. Apunta al servicio
 * compartido `@/lib/ops/asistencia-control`. Gate: módulo `ops`.
 * Body: { action: "en_camino" | "confirmar" | "ausente", resultado?, minutosAtraso?, comentario?, motivo? }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await ensureOpsAccess(ctx);
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    resultado?: string;
    minutosAtraso?: number;
    comentario?: string;
    motivo?: string;
  };

  const base = {
    tenantId: ctx.tenantId,
    asistenciaId: id,
    operadorId: ctx.userId,
    operadorName: ctx.userEmail,
  };

  let result;
  if (body.action === "en_camino") {
    const resultado = RESULTADOS.includes(body.resultado as ContactoResultado)
      ? (body.resultado as ContactoResultado)
      : null;
    if (!resultado) {
      return NextResponse.json({ ok: false, error: "resultado inválido" }, { status: 400 });
    }
    result = await marcarEnCamino({
      ...base,
      resultado,
      minutosAtraso: typeof body.minutosAtraso === "number" ? body.minutosAtraso : null,
      comentario: body.comentario ?? null,
      origen: "web",
    });
  } else if (body.action === "confirmar") {
    result = await confirmarLlegada(base);
  } else if (body.action === "ausente") {
    result = await reportarAusencia({ ...base, motivo: body.motivo ?? null });
  } else {
    return NextResponse.json({ ok: false, error: "action inválida" }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  // Refresca el tablero de relevo si hay uno OPEN. Best-effort.
  if (result.installationId && result.date) {
    import("@/lib/ops/relevo-board")
      .then((m) =>
        m.refreshRelevoBoardForInstallation(ctx.tenantId, result.installationId!, result.date!),
      )
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, attendanceStatus: result.attendanceStatus, needsCobertura: result.needsCobertura ?? false });
}
