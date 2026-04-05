import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-auth";
import { cambiarPin } from "@/lib/ats/pin.service";
import { getPortalSessionFromRequest } from "@/lib/ats/portal-auth";

const changePinSchema = z.object({
  guardiaId: z.string().uuid().optional(), // Legacy — prefer JWT session
  nuevoPin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener entre 4 y 6 dígitos"),
});

export async function PATCH(request: NextRequest) {
  try {
    const parsed = await parseBody(request, changePinSchema);
    if (parsed.error) return parsed.error;
    const { guardiaId: bodyGuardiaId, nuevoPin } = parsed.data;

    const session = await getPortalSessionFromRequest(request);
    let guardiaId: string;
    if (session) {
      guardiaId = session.guardiaId;
    } else {
      // Legacy fallback
      guardiaId = bodyGuardiaId || "";
      if (!guardiaId) {
        return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
      }
      console.warn("[ATS Portal] Legacy guardiaId auth — migrate to JWT");
    }

    await cambiarPin(guardiaId, nuevoPin);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ATS] Error changing PIN:", error);
    return NextResponse.json({ success: false, error: "Error al cambiar PIN" }, { status: 500 });
  }
}
