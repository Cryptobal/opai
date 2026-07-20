/**
 * API pública (sin auth) de la landing de cobro /cobro/[token].
 *
 * GET  → vista del documento (dispara SENT → VIEWED en la primera apertura).
 * POST → acción del cliente: approve | reject | add_reference.
 *
 * El tenant se deriva del token en el service; el cliente nunca lo envía.
 * Respuestas no cacheables (Cache-Control: no-store).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getPublicCobroView,
  approveCobro,
  rejectCobro,
  addClientReference,
  CobroError,
} from "@/modules/finance/billing/cobro-confirmation.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

function clientMeta(req: NextRequest): { ip: string | null; ua: string | null } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent") || null;
  return { ip, ua };
}

function mapError(err: unknown): NextResponse {
  if (err instanceof CobroError) {
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "EXPIRED" ? 410 : 409;
    return NextResponse.json(
      { success: false, error: err.message, code: err.code },
      { status, headers: NO_STORE },
    );
  }
  console.error("[public/cobro] error:", err);
  return NextResponse.json(
    { success: false, error: "Ocurrió un error inesperado." },
    { status: 500, headers: NO_STORE },
  );
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    const view = await getPublicCobroView(token, clientMeta(req));
    if (!view) {
      return NextResponse.json(
        { success: false, error: "Este enlace no es válido." },
        { status: 404, headers: NO_STORE },
      );
    }
    if (view.expired) {
      return NextResponse.json(
        { success: false, error: "Este enlace expiró.", view },
        { status: 410, headers: NO_STORE },
      );
    }
    return NextResponse.json({ success: true, view }, { headers: NO_STORE });
  } catch (err) {
    return mapError(err);
  }
}

const Body = z.object({
  action: z.enum(["approve", "reject", "add_reference"]),
  ocFolio: z.string().max(120).optional().nullable(),
  extraRef: z.string().max(300).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  // Email opcional de quien confirma; formato libre (solo se registra).
  actorEmail: z.string().max(200).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Solicitud inválida." },
        { status: 400, headers: NO_STORE },
      );
    }
    const { action, ocFolio, extraRef, comment, actorEmail } = parsed.data;
    const meta = { ...clientMeta(req), actorEmail: actorEmail ?? null };

    let view;
    if (action === "approve") {
      view = await approveCobro(token, { ...meta, ocFolio, extraRef });
    } else if (action === "reject") {
      view = await rejectCobro(token, { ...meta, comment: comment ?? "" });
    } else {
      view = await addClientReference(token, { ...meta, ocFolio, extraRef });
    }
    return NextResponse.json({ success: true, view }, { headers: NO_STORE });
  } catch (err) {
    return mapError(err);
  }
}
