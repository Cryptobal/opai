/**
 * API Route: /api/docs/templates
 * GET  - Listar templates de documentos (auto-seed WhatsApp del sistema)
 * POST - Crear template de documento
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { createDocTemplateSchema } from "@/lib/validations/docs";
import { extractTokenKeys } from "@/lib/docs/token-resolver";

/** Convierte texto plano a Tiptap JSON (un párrafo por línea) */
function plainTextToTiptap(text: string): any {
  const lines = text.split("\n");
  const content = lines.map((line) => ({
    type: "paragraph" as const,
    content: line ? [{ type: "text" as const, text: line }] : [],
  }));
  return { type: "doc", content };
}

/** Seeds iniciales de WhatsApp que se crean automáticamente por tenant */
const WA_SEEDS: {
  slug: string;
  name: string;
  category: string;
  description: string;
  body: string;
}[] = [
  {
    slug: "lead_commercial",
    name: "WhatsApp — Nuevo lead (comercial al cliente)",
    category: "lead_commercial",
    description: "Mensaje prellenado al hacer clic en WhatsApp del email de nuevo lead (enviado al comercial).",
    body: `Hola {nombre}, ¿cómo estás?\n\nRecibimos tu solicitud de cotización para {empresa}, ubicada en {direccion}.\n\nEstamos preparando una propuesta personalizada para ti. Si tienes alguna duda en el proceso, responde este mensaje y te ayudamos de inmediato.\n\nServicio: {servicio} | Dotación: {dotacion}\n\nhttp://gard.cl`,
  },
  {
    slug: "lead_client",
    name: "WhatsApp — Nuevo lead (cliente a Gard)",
    category: "lead_client",
    description: "Mensaje prellenado que el cliente ve al hacer clic en WhatsApp del email de confirmación.",
    body: `Hola, soy {nombre} {apellido} de la empresa {empresa}.`,
  },
  {
    slug: "proposal_sent",
    name: "WhatsApp — Propuesta enviada",
    category: "proposal_sent",
    description: "Mensaje al compartir la propuesta por WhatsApp después de enviarla por email.",
    body: `Hola {contactName}, te envío la propuesta de Gard Security para {companyName}:\n\n{proposalUrl}`,
  },
  {
    slug: "followup_first",
    name: "WhatsApp — 1er seguimiento",
    category: "followup_first",
    description: "Mensaje de WhatsApp en la notificación del 1er seguimiento automático.",
    body: `Hola {contactName}, ¿cómo estás?\n\nTe hago seguimiento a la propuesta de {dealTitle} enviada el {proposalSentDate}.\n\n{proposalLink}\n\nCualquier duda quedo atento. Saludos!`,
  },
  {
    slug: "followup_second",
    name: "WhatsApp — 2do seguimiento",
    category: "followup_second",
    description: "Mensaje de WhatsApp en la notificación del 2do seguimiento automático.",
    body: `Hola {contactName}, ¿cómo estás?\n\nTe escribo nuevamente respecto a la propuesta de {dealTitle} que te enviamos el {proposalSentDate}.\n\n¿Has tenido oportunidad de revisarla? Si necesitas que ajustemos algo, estoy disponible.\n\n{proposalLink}\n\nSaludos!`,
  },
];

/** Crea los templates WA del sistema si no existen para este tenant */
async function ensureWhatsAppSeeds(tenantId: string, userId: string) {
  const existing = await prisma.docTemplate.count({
    where: { tenantId, module: "whatsapp" },
  });
  if (existing > 0) return;

  for (const seed of WA_SEEDS) {
    const content = plainTextToTiptap(seed.body);
    await prisma.docTemplate.create({
      data: {
        tenantId,
        name: seed.name,
        description: seed.description,
        content,
        module: "whatsapp",
        category: seed.category,
        tokensUsed: [],
        isActive: true,
        isDefault: false,
        usageSlug: seed.slug,
        createdBy: userId,
      },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { searchParams } = new URL(request.url);
    const module = searchParams.get("module");
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("active") !== "false";

    // Auto-seed WhatsApp del sistema si aún no existen
    if (!module || module === "whatsapp") {
      await ensureWhatsAppSeeds(ctx.tenantId, ctx.userId);
    }

    const templates = await prisma.docTemplate.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(module ? { module } : {}),
        ...(category ? { category } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { documents: true, versions: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("Error fetching doc templates:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, createDocTemplateSchema);
    if (parsed.error) return parsed.error;

    const { name, description, content, module, category, isDefault, usageSlug } = parsed.data;

    // Auto-extract tokens from content
    const tokensUsed = extractTokenKeys(content);

    const template = await prisma.$transaction(async (tx) => {
      // If setting as default, unset others in same module+category
      if (isDefault) {
        await tx.docTemplate.updateMany({
          where: {
            tenantId: ctx.tenantId,
            module,
            category,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      const created = await tx.docTemplate.create({
        data: {
          tenantId: ctx.tenantId,
          name,
          description,
          content,
          module,
          category,
          tokensUsed,
          isDefault: isDefault ?? false,
          usageSlug: usageSlug ?? undefined,
          createdBy: ctx.userId,
        },
        include: {
          _count: {
            select: { documents: true, versions: true },
          },
        },
      });

      // Create initial version
      await tx.docTemplateVersion.create({
        data: {
          templateId: created.id,
          version: 1,
          content,
          changeNote: "Versión inicial",
          createdBy: ctx.userId,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un template con ese nombre en este módulo" },
        { status: 409 }
      );
    }
    console.error("Error creating doc template:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear template" },
      { status: 500 }
    );
  }
}
