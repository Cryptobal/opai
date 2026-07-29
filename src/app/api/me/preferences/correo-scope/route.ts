import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { listUserMailboxes } from "@/modules/crm/email/mailbox-scope";

export const dynamic = "force-dynamic";

type PrefData = Record<string, Prisma.JsonValue | undefined>;

function readScope(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = (data as PrefData).correoScope;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

async function mergeData(userId: string, patch: PrefData) {
  const existing = await prisma.adminPreference.findUnique({
    where: { adminId: userId },
    select: { data: true },
  });
  const prev =
    existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data)
      ? (existing.data as PrefData)
      : {};
  const next = { ...prev, ...patch } as Prisma.InputJsonValue;
  await prisma.adminPreference.upsert({
    where: { adminId: userId },
    create: { adminId: userId, data: next },
    update: { data: next },
  });
  return next;
}

/**
 * GET /api/me/preferences/correo-scope
 * { success, correoScope: "all" | uuid }
 * Si la casilla guardada ya no existe, degrada a "all" y sobrescribe.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const pref = await prisma.adminPreference.findUnique({
    where: { adminId: ctx.userId },
    select: { data: true },
  });
  let correoScope = readScope(pref?.data) ?? "all";

  if (correoScope !== "all") {
    const mailboxes = await listUserMailboxes({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });
    if (!mailboxes.some((m) => m.id === correoScope)) {
      correoScope = "all";
      await mergeData(ctx.userId, { correoScope: "all" });
    }
  }

  return NextResponse.json({ success: true, correoScope });
}

/**
 * PUT /api/me/preferences/correo-scope
 * Body: { correoScope: "all" | uuid }
 */
export async function PUT(req: Request) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  let body: { correoScope?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.correoScope === "string" ? body.correoScope.trim() : "";
  if (!raw) {
    return NextResponse.json({ success: false, error: "correoScope requerido" }, { status: 400 });
  }

  if (raw === "all") {
    await mergeData(ctx.userId, { correoScope: "all" });
    return NextResponse.json({ success: true, correoScope: "all" });
  }

  const mailboxes = await listUserMailboxes({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  if (!mailboxes.some((m) => m.id === raw)) {
    return NextResponse.json(
      { success: false, error: "Casilla no pertenece al usuario" },
      { status: 403 },
    );
  }

  await mergeData(ctx.userId, { correoScope: raw });
  return NextResponse.json({ success: true, correoScope: raw });
}
