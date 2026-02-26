/**
 * API Route: /api/crm/notes/[id]
 * PATCH  - Update a note (only owner can edit)
 * DELETE - Delete a note (only owner can delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const note = await prisma.crmNote.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!note) {
    return NextResponse.json(
      { success: false, error: "Nota no encontrada" },
      { status: 404 }
    );
  }

  if (note.createdBy !== ctx.userId) {
    return NextResponse.json(
      { success: false, error: "Solo puedes editar tus propias notas" },
      { status: 403 }
    );
  }

  const updated = await prisma.crmNote.update({
    where: { id },
    data: {
      content: body.content?.trim() || note.content,
      mentions: Array.isArray(body.mentions) ? body.mentions : note.mentions,
      mentionMeta:
        body.mentionMeta && typeof body.mentionMeta === "object"
          ? (body.mentionMeta as any)
          : note.mentionMeta,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const note = await prisma.crmNote.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!note) {
    return NextResponse.json(
      { success: false, error: "Nota no encontrada" },
      { status: 404 }
    );
  }

  if (note.createdBy !== ctx.userId) {
    return NextResponse.json(
      { success: false, error: "Solo puedes eliminar tus propias notas" },
      { status: 403 }
    );
  }

  await prisma.crmNote.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
