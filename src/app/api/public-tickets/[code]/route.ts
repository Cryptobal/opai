import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { code: string };

const CODE_RE = /^TK-\d{6}-\d{4}$/;
const PIN_RE = /^\d{4,6}$/;
const MAX_ATTEMPTS = 6; // 6 fallos → 15 min de bloqueo
const LOCK_MINUTES = 15;

/**
 * GET /api/public-tickets/[code]?pin=<n>
 * Endpoint público (sin auth). Verifica el PIN contra el hash y
 * devuelve la información mínima del ticket: code, title, status,
 * fechas, y comments públicos (isInternal=false). NUNCA devuelve
 * notas internas ni emails (privacidad).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { code } = await params;
    if (!CODE_RE.test(code)) {
      return NextResponse.json(
        { success: false, error: "Código inválido" },
        { status: 400 },
      );
    }
    const pin = new URL(request.url).searchParams.get("pin") ?? "";
    if (!PIN_RE.test(pin)) {
      return NextResponse.json(
        { success: false, error: "PIN inválido" },
        { status: 400 },
      );
    }

    const ticket = await prisma.opsTicket.findFirst({
      where: { code },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        slaDueAt: true,
        publicPinHash: true,
        publicAttempts: true,
        publicLockedUntil: true,
      },
    });
    if (!ticket || !ticket.publicPinHash) {
      // No revelamos si existe o no — siempre 401 para evitar enumeración.
      return NextResponse.json(
        { success: false, error: "Credenciales inválidas" },
        { status: 401 },
      );
    }

    // Locked?
    if (
      ticket.publicLockedUntil &&
      new Date(ticket.publicLockedUntil).getTime() > Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Acceso bloqueado temporalmente. Reintenta en unos minutos.",
        },
        { status: 429 },
      );
    }

    const ok = await bcrypt.compare(pin, ticket.publicPinHash);
    if (!ok) {
      const newAttempts = (ticket.publicAttempts ?? 0) + 1;
      const lockUntil =
        newAttempts >= MAX_ATTEMPTS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null;
      await prisma.opsTicket.update({
        where: { id: ticket.id },
        data: {
          publicAttempts: newAttempts,
          publicLockedUntil: lockUntil,
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: lockUntil
            ? "Demasiados intentos. Acceso bloqueado por 15 minutos."
            : "Credenciales inválidas",
        },
        { status: 401 },
      );
    }

    // Reset attempts y registrar último acceso.
    await prisma.opsTicket.update({
      where: { id: ticket.id },
      data: {
        publicAttempts: 0,
        publicLockedUntil: null,
        publicLastAccessAt: new Date(),
      },
    });

    // Comentarios públicos: no internos, no email_in/email_out (los
    // emails son privados al backoffice). En el futuro se puede
    // exponer comments con direction="external" si se modela esa
    // dirección; por ahora preferimos lo conservador.
    const publicComments = await prisma.opsTicketComment.findMany({
      where: {
        ticketId: ticket.id,
        isInternal: false,
        direction: "internal",
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        code: ticket.code,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        createdAt:
          ticket.createdAt instanceof Date
            ? ticket.createdAt.toISOString()
            : ticket.createdAt,
        slaDueAt:
          ticket.slaDueAt instanceof Date
            ? ticket.slaDueAt.toISOString()
            : ticket.slaDueAt,
        resolvedAt:
          ticket.resolvedAt instanceof Date
            ? ticket.resolvedAt.toISOString()
            : ticket.resolvedAt,
        closedAt:
          ticket.closedAt instanceof Date
            ? ticket.closedAt.toISOString()
            : ticket.closedAt,
        comments: publicComments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt:
            c.createdAt instanceof Date
              ? c.createdAt.toISOString()
              : c.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error("[public-tickets] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}
