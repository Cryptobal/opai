import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

type Params = { id: string };

/**
 * GET /api/ops/tickets/[id]/public-pin → estado del portal público:
 *   { hasPin: boolean, setAt: string | null, lastAccessAt: string | null }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const t = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        publicPinHash: true,
        publicPinSetAt: true,
        publicLastAccessAt: true,
      },
    });
    if (!t) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        hasPin: !!t.publicPinHash,
        setAt:
          t.publicPinSetAt instanceof Date
            ? t.publicPinSetAt.toISOString()
            : t.publicPinSetAt,
        lastAccessAt:
          t.publicLastAccessAt instanceof Date
            ? t.publicLastAccessAt.toISOString()
            : t.publicLastAccessAt,
      },
    });
  } catch (err) {
    console.error("[OPS] public-pin GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ops/tickets/[id]/public-pin
 * Genera (o regenera) un PIN de 6 dígitos para acceso público al
 * ticket. El PIN se devuelve UNA SOLA VEZ al admin para que lo
 * comparta con el cliente; en DB queda solo el hash.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const t = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    if (!t) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    // PIN de 6 dígitos generado con crypto, no Math.random.
    const { randomInt } = await import("crypto");
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const hash = await bcrypt.hash(pin, 10);

    await prisma.opsTicket.update({
      where: { id },
      data: {
        publicPinHash: hash,
        publicPinSetAt: new Date(),
        publicAttempts: 0,
        publicLockedUntil: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        pin, // visible una sola vez
        url: `/t/${t.code}`,
      },
    });
  } catch (err) {
    console.error("[OPS] public-pin POST error:", err);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/ops/tickets/[id]/public-pin
 * Revoca el PIN. El portal público deja de aceptar el código.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const updated = await prisma.opsTicket.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        publicPinHash: null,
        publicPinSetAt: null,
        publicAttempts: 0,
        publicLockedUntil: null,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[OPS] public-pin DELETE error:", err);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}
