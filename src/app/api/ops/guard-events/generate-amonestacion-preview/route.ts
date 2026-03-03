import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

/**
 * POST /api/ops/guard-events/generate-amonestacion-preview
 * Body: { guardiaId: string, reason: string }
 * Returns: { success: true, html: string }
 *
 * Generates a preview of the amonestación letter using AI.
 * Does NOT save anything — only returns the HTML for preview.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { guardiaId, reason } = body;

    if (!guardiaId || !reason) {
      return NextResponse.json(
        { success: false, error: "guardiaId y reason son requeridos" },
        { status: 400 },
      );
    }

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId: ctx.tenantId },
      include: {
        persona: { select: { firstName: true, lastName: true, rut: true, address: true, commune: true, email: true, phone: true } },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const p = guardia.persona;
    const fullName = `${p.firstName} ${p.lastName}`;

    const prompt = `Genera una carta formal de amonestación escrita para un guardia de seguridad. La carta debe ser profesional, en español de Chile, y firmada por el representante legal de GARD SEGURIDAD LTDA.

Datos del guardia:
- Nombre completo: ${fullName}
- RUT: ${p.rut ?? "Sin RUT"}
- Dirección: ${p.address ?? "Sin dirección"}, ${p.commune ?? ""}
- Email: ${p.email ?? "Sin email"}
- Teléfono: ${p.phone ?? "Sin teléfono"}

Motivo de la amonestación:
${reason}

La carta debe incluir:
1. Fecha actual (usa la fecha de hoy)
2. Datos del destinatario (guardia)
3. Referencia: "Amonestación Escrita"
4. Cuerpo detallado con los hechos que motivan la amonestación basándote en el motivo proporcionado
5. Advertencia formal de que una reiteración puede derivar en sanciones mayores incluyendo el término del contrato
6. Espacio para firma del representante legal (Jorge Andrés Montenegro Fuenzalida, RUT 13.051.246-1) y del trabajador
7. Pie: "GARD SEGURIDAD LTDA."

Responde SOLO con el HTML de la carta. Usa etiquetas HTML: <h1>, <h2>, <p>, <strong>, <br/>. No uses markdown ni explicaciones.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const html = completion.choices[0]?.message?.content ?? "";

    return NextResponse.json({ success: true, html });
  } catch (error) {
    console.error("[OPS] Error generating amonestacion preview:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar la carta" },
      { status: 500 },
    );
  }
}
