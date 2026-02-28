/**
 * API Route: /api/crm/accounts/[id]/regenerate-notes
 * POST - Regenera la descripción de la empresa con IA
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiGenerate } from "@/lib/ai-service";
import { requireAuth, unauthorized } from "@/lib/api-auth";

const ACCOUNT_LOGO_PREFIX = "[[ACCOUNT_LOGO_URL:";
const ACCOUNT_LOGO_SUFFIX = "]]";

function stripLogoMarker(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes.replace(/\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g, "").trim();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = (await request.json()) as { customInstruction?: string };
    const customInstruction = (body?.customInstruction || "").trim();

    const account = await prisma.crmAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true, notes: true, website: true, industry: true, segment: true },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    const currentNotes = stripLogoMarker(account.notes);
    const context = [
      `Empresa: ${account.name}`,
      account.industry ? `Industria: ${account.industry}` : "",
      account.segment ? `Segmento: ${account.segment}` : "",
      account.website ? `Sitio web: ${account.website}` : "",
      currentNotes ? `Descripción actual:\n${currentNotes}` : "Sin descripción previa.",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Eres el Gerente de Operaciones de Gard Security (https://gard.cl), empresa líder en seguridad privada profesional en Chile.

Tu tarea: generar o reescribir la descripción de la empresa para usarla en propuestas comerciales (Resumen Ejecutivo). El texto debe ser breve, directo y útil para personalizar la propuesta.

CONTEXTO:
${context}
${
  customInstruction
    ? `\nINSTRUCCIÓN ADICIONAL DEL USUARIO (aplicar al texto): ${customInstruction}`
    : ""
}

Requisitos:
- MÁXIMO 600 caracteres (aprox. 80-100 palabras)
- Tono: ejecutivo, profesional
- NO inventes datos que no estén en el contexto
- Si no hay datos suficientes, genera una descripción genérica breve basada en nombre e industria

Responde SOLO con el texto de la descripción, sin comillas ni prefijos.`;

    const newSummary = (await aiGenerate(prompt, {
      maxTokens: 400,
      temperature: 0.5,
    })).trim();

    if (!newSummary) {
      return NextResponse.json(
        { success: false, error: "No se pudo generar la descripción" },
        { status: 500 }
      );
    }

    // Preservar el marcador de logo si existe
    const logoMatch = account.notes?.match(
      new RegExp(
        `\\[\\[ACCOUNT_LOGO_URL:[^\\]]+\\]\\]`,
        "g"
      )
    );
    const logoMarker = logoMatch ? logoMatch[0] + "\n" : "";
    const newNotes = logoMarker + newSummary;

    await prisma.crmAccount.update({
      where: { id: account.id },
      data: { notes: newNotes },
    });

    return NextResponse.json({
      success: true,
      data: { summary: newSummary, notes: newNotes },
    });
  } catch (error) {
    console.error("Error regenerating account notes:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "No se pudo regenerar la descripción",
      },
      { status: 500 }
    );
  }
}
