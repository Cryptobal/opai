import { NextRequest, NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_CORREO_AI_STYLE,
  parseCorreoAiStyle,
  type CorreoAiStyle,
} from "@/modules/crm/email/correo-ai-style";
import {
  loadCorreoAiStyleScope,
  resolveCorreoAiStyle,
} from "@/modules/crm/email/correo-ai-style.server";

function parseScope(raw: string | null): "user" | "tenant" {
  return raw === "tenant" ? "tenant" : "user";
}

export async function GET(req: NextRequest) {
  const mod = await requireCorreosAccess("view");
  if (!mod.authorized) return mod.response;
  const { ctx } = mod;
  const scope = parseScope(req.nextUrl.searchParams.get("scope"));
  const style = await loadCorreoAiStyleScope(ctx.tenantId, ctx.userId, scope);
  const effective = await resolveCorreoAiStyle(ctx.tenantId, ctx.userId);
  return NextResponse.json({
    scope,
    style: style ?? (scope === "tenant" ? DEFAULT_CORREO_AI_STYLE : null),
    effective,
    hasPersonal: Boolean(
      await loadCorreoAiStyleScope(ctx.tenantId, ctx.userId, "user"),
    ),
    canEditTenant: canEdit(await resolveApiPerms(ctx), "config"),
  });
}

export async function PUT(req: NextRequest) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;
  const { ctx } = mod;
  const body = (await req.json().catch(() => ({}))) as {
    scope?: unknown;
    style?: unknown;
  };
  const scope = body.scope === "tenant" ? "tenant" : "user";
  const perms = await resolveApiPerms(ctx);
  if (scope === "tenant" && !canEdit(perms, "config")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para editar el estilo de la empresa" },
      { status: 403 },
    );
  }
  const style = parseCorreoAiStyle(body.style);
  const userId = scope === "user" ? ctx.userId : null;

  try {
    const existing = await prisma.crmEmailAiStyle.findFirst({
      where: { tenantId: ctx.tenantId, userId },
    });

    let saved: CorreoAiStyle;
    if (existing) {
      const row = await prisma.crmEmailAiStyle.update({
        where: { id: existing.id },
        data: {
          closeness: style.closeness,
          addressing: style.addressing,
          length: style.length,
          avoidWords: style.avoidWords,
          guidance: style.guidance,
        },
      });
      saved = parseCorreoAiStyle(row);
    } else {
      const row = await prisma.crmEmailAiStyle.create({
        data: {
          tenantId: ctx.tenantId,
          userId,
          closeness: style.closeness,
          addressing: style.addressing,
          length: style.length,
          avoidWords: style.avoidWords,
          guidance: style.guidance,
        },
      });
      saved = parseCorreoAiStyle(row);
    }

    if (scope === "tenant") {
      await logAudit({
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        action: "UPDATE",
        entity: "CrmEmailAiStyle",
        entityId: ctx.tenantId,
        tenantId: ctx.tenantId,
        details: { scope: "tenant", style: saved },
        request: req,
      });
    }

    const effective = await resolveCorreoAiStyle(ctx.tenantId, ctx.userId);
    return NextResponse.json({ scope, style: saved, effective });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : null;
    console.error("[correos] Error guardando estilo IA:", error);
    if (code === "P2021") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Falta la tabla de estilo IA en la base de datos. Aplica la migración crm_email_ai_style.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { success: false, error: "No se pudo guardar el estilo de respuesta" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const mod = await requireCorreosAccess("edit");
  if (!mod.authorized) return mod.response;
  const { ctx } = mod;
  const scope = parseScope(req.nextUrl.searchParams.get("scope"));
  if (scope !== "user") {
    return NextResponse.json(
      { success: false, error: "Solo se puede restaurar el override personal" },
      { status: 400 },
    );
  }
  await prisma.crmEmailAiStyle.deleteMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId },
  });
  const effective = await resolveCorreoAiStyle(ctx.tenantId, ctx.userId);
  return NextResponse.json({ ok: true, effective });
}
