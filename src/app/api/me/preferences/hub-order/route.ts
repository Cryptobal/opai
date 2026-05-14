import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isHubSectionKey } from "@/app/(app)/hub/_lib/hub-sections-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/preferences/hub-order
 * Retorna { hubOrder, hubHidden } del usuario. Si nunca personalizó,
 * retorna arrays vacíos (el cliente sabe que eso significa "usar default").
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const pref = await prisma.adminPreference.findUnique({
    where: { adminId: ctx.userId },
    select: { hubOrder: true, hubHidden: true },
  });
  return NextResponse.json({
    success: true,
    hubOrder: pref?.hubOrder ?? [],
    hubHidden: pref?.hubHidden ?? [],
  });
}

/**
 * PUT /api/me/preferences/hub-order
 * Body: { order?: string[]; hidden?: string[] }
 *
 * Validación:
 *  - Keys desconocidas se DESCARTAN silenciosamente (no error 400).
 *    Esto protege contra clientes con caché viejo tras un refactor.
 *  - Duplicados en `order` se colapsan al primero.
 *  - Una key no puede estar en order y hidden simultáneamente → si lo
 *    está, prevalece su presencia en `hidden` (se quita de `order`).
 *  - Si el body trae `order: []` y `hidden: []`, se considera "reset
 *    al default" y se borra el registro (no se guarda fila vacía).
 */
export async function PUT(req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  let body: { order?: unknown; hidden?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const rawOrder = Array.isArray(body.order) ? body.order : [];
  const rawHidden = Array.isArray(body.hidden) ? body.hidden : [];

  const cleanOrder: string[] = [];
  const seen = new Set<string>();
  for (const k of rawOrder) {
    if (typeof k === "string" && isHubSectionKey(k) && !seen.has(k)) {
      cleanOrder.push(k);
      seen.add(k);
    }
  }

  const cleanHidden: string[] = [];
  const seenH = new Set<string>();
  for (const k of rawHidden) {
    if (typeof k === "string" && isHubSectionKey(k) && !seenH.has(k)) {
      cleanHidden.push(k);
      seenH.add(k);
    }
  }

  const finalOrder = cleanOrder.filter((k) => !cleanHidden.includes(k));

  if (finalOrder.length === 0 && cleanHidden.length === 0) {
    await prisma.adminPreference.deleteMany({ where: { adminId: ctx.userId } });
    return NextResponse.json({ success: true, hubOrder: [], hubHidden: [] });
  }

  await prisma.adminPreference.upsert({
    where: { adminId: ctx.userId },
    create: { adminId: ctx.userId, hubOrder: finalOrder, hubHidden: cleanHidden },
    update: { hubOrder: finalOrder, hubHidden: cleanHidden },
  });

  return NextResponse.json({ success: true, hubOrder: finalOrder, hubHidden: cleanHidden });
}
