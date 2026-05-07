/**
 * API Route: /api/docs/templates
 * GET  - Listar templates de documentos (auto-seed WhatsApp del sistema)
 * POST - Crear template de documento
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireDocsViewAny, requireDocsEdit } from "@/lib/api-auth-docs";
import { createDocTemplateSchema } from "@/lib/validations/docs";
import { extractTokenKeys } from "@/lib/docs/token-resolver";
import { seedWaTemplatesForTenant } from "@/lib/docs/seed-wa-templates";
import {
  LEGACY_WA_PLACEHOLDER_MAP,
  migrateLegacyPlaceholdersInTiptap,
} from "@/lib/docs/wa-template-migrations";

/** Convierte texto plano a Tiptap JSON (un párrafo por línea) */
function plainTextToTiptap(text: string): any {
  const lines = text.split("\n");
  const content = lines.map((line) => ({
    type: "paragraph" as const,
    content: line ? [{ type: "text" as const, text: line }] : [],
  }));
  return { type: "doc", content };
}

/** Seeds de email de seguimiento automático */
const MAIL_FOLLOWUP_SEEDS: {
  slug: string;
  name: string;
  category: string;
  description: string;
  body: string;
}[] = [
  {
    slug: "email_followup_1",
    name: "1er Seguimiento automático",
    category: "followup",
    description: "Email del primer seguimiento automático tras enviar propuesta. Se envía según los días configurados en Configuración CRM.",
    body: `Estimado/a {{contact.firstName}},

Espero que se encuentre bien. Me permito hacer un breve seguimiento respecto a la propuesta que le enviamos el {{deal.proposalSentDate}} para {{deal.title}}.

Entendemos que este tipo de decisiones requieren análisis, y quedamos a su completa disposición para resolver cualquier consulta, ajustar la propuesta a sus requerimientos específicos, o coordinar una reunión para revisar los detalles en conjunto.

Puede acceder a la propuesta en el Portal del Cliente, donde podrá revisarla en detalle, descargar los documentos y mantener la comunicación con nuestro equipo:
{{deal.proposalLink}}

Quedo atento a sus comentarios.

Saludos cordiales`,
  },
  {
    slug: "email_followup_2",
    name: "2do Seguimiento automático",
    category: "followup",
    description: "Email del segundo seguimiento automático tras enviar propuesta. Se envía según los días configurados en Configuración CRM.",
    body: `Hola {{contact.firstName}},

Le escribo nuevamente respecto a la propuesta que le compartimos el {{deal.proposalSentDate}} para {{deal.title}} de {{account.name}}.

Nos gustaría saber si ha tenido oportunidad de revisarla y si hay algún aspecto que le gustaría que profundicemos o ajustemos. Estamos abiertos a adaptar nuestra propuesta para que se ajuste mejor a las necesidades de su operación.

Le recuerdo que puede acceder a la propuesta en todo momento desde el Portal del Cliente:
{{deal.proposalLink}}

Si lo prefiere, podemos coordinar una breve llamada o reunión para revisar los puntos clave juntos. Estaré encantado de agendar en el horario que mejor le acomode.

Saludos cordiales`,
  },
  {
    slug: "email_followup_3",
    name: "3er Seguimiento automático",
    category: "followup",
    description: "Email del tercer seguimiento automático. Tras enviarse, el negocio se cierra como perdido automáticamente.",
    body: `Hola {{contact.firstName}},

Este es nuestro último seguimiento respecto a la propuesta enviada el {{deal.proposalSentDate}} para {{deal.title}} de {{account.name}}.

Si te interesa continuar, podemos retomar de inmediato con los ajustes que necesites para avanzar.

Te dejo nuevamente el acceso al Portal del Cliente para revisar la propuesta:
{{deal.proposalLink}}

Si no recibimos respuesta, cerraremos esta oportunidad por ahora.

Saludos cordiales`,
  },
];

/** Crea los templates de email de seguimiento si no existen para este tenant */
async function ensureFollowUpMailSeeds(tenantId: string, userId: string) {
  for (const seed of MAIL_FOLLOWUP_SEEDS) {
    const existing = await prisma.docTemplate.findFirst({
      where: { tenantId, module: "mail", usageSlug: seed.slug },
    });
    if (existing) continue;

    const content = plainTextToTiptap(seed.body);
    const tokensUsed = extractTokenKeys(content);
    await prisma.docTemplate.create({
      data: {
        tenantId,
        name: seed.name,
        description: seed.description,
        content,
        module: "mail",
        category: seed.category,
        tokensUsed,
        isActive: true,
        isDefault: false,
        usageSlug: seed.slug,
        createdBy: userId,
      },
    });
  }
}

/**
 * Migra in-place plantillas existentes que aún usen placeholders del formato
 * legacy:
 *  - `{nombre}` / `{empresa}` / … (single-word, mapeo por slug WA).
 *  - `{module.field}` (sin doble llave, presente en seeds viejos de email).
 * Reemplaza por `{{module.field}}` y persiste. Idempotente.
 */
async function upgradeLegacyTemplates(
  tenantId: string,
  module: "whatsapp" | "mail",
) {
  const existing = await prisma.docTemplate.findMany({
    where: {
      tenantId,
      module,
      ...(module === "whatsapp"
        ? { usageSlug: { in: Object.keys(LEGACY_WA_PLACEHOLDER_MAP) } }
        : {}),
    },
    select: { id: true, usageSlug: true, content: true },
  });

  for (const tpl of existing) {
    const { migrated, changed } = migrateLegacyPlaceholdersInTiptap(
      tpl.content,
      tpl.usageSlug ?? undefined,
    );
    if (!changed) continue;
    try {
      await prisma.docTemplate.update({
        where: { id: tpl.id },
        data: {
          content: migrated as object,
          tokensUsed: extractTokenKeys(migrated),
        },
      });
    } catch (err) {
      console.warn(
        `[docs] Falló migración legacy en docTemplate ${tpl.id} (module=${module}, slug=${tpl.usageSlug}):`,
        err,
      );
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    // Las plantillas se leen tanto desde el editor de plantillas como desde
    // la generación de documentos (gestión). Aceptamos cualquiera de los dos.
    const forbidden = await requireDocsViewAny(ctx, ["plantillas", "gestion"]);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const module = searchParams.get("module");
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("active") !== "false";

    // Auto-seed WhatsApp del sistema si aún no existen + upgrade de legacy
    if (!module || module === "whatsapp") {
      await seedWaTemplatesForTenant(ctx.tenantId, ctx.userId);
      await upgradeLegacyTemplates(ctx.tenantId, "whatsapp");
    }
    // Auto-seed email follow-up templates + upgrade de legacy
    if (!module || module === "mail") {
      await ensureFollowUpMailSeeds(ctx.tenantId, ctx.userId);
      await upgradeLegacyTemplates(ctx.tenantId, "mail");
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
    const forbidden = await requireDocsEdit(ctx, "plantillas");
    if (forbidden) return forbidden;

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
