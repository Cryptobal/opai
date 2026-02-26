import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("noteId");
    if (!noteId) {
      return NextResponse.json(
        { success: false, error: "noteId es requerido" },
        { status: 400 }
      );
    }

    const note = await prisma.crmNote.findFirst({
      where: { id: noteId, tenantId: ctx.tenantId },
    });
    if (!note) {
      return NextResponse.json(
        { success: false, error: "Nota no encontrada" },
        { status: 404 }
      );
    }

    const rootId = note.parentId || note.id;
    const threadNotes = await prisma.crmNote.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ id: rootId }, { parentId: rootId }],
      },
      orderBy: { createdAt: "asc" },
    });

    const authorIds = [...new Set(threadNotes.map((item) => item.createdBy))];
    const authors = await prisma.admin.findMany({
      where: {
        tenantId: ctx.tenantId,
        id: { in: authorIds },
      },
      select: { id: true, name: true, email: true },
    });
    const authorMap = Object.fromEntries(authors.map((author) => [author.id, author]));

    const root = threadNotes.find((item) => item.id === rootId);
    if (!root) {
      return NextResponse.json(
        { success: false, error: "Hilo no encontrado" },
        { status: 404 }
      );
    }

    const replies = threadNotes
      .filter((item) => item.parentId === rootId)
      .map((item) => ({
        ...item,
        author: authorMap[item.createdBy] || {
          id: item.createdBy,
          name: "Usuario",
          email: "",
        },
      }));

    return NextResponse.json({
      success: true,
      data: {
        root: {
          ...root,
          author: authorMap[root.createdBy] || {
            id: root.createdBy,
            name: "Usuario",
            email: "",
          },
        },
        replies,
      },
    });
  } catch (error) {
    console.error("Error fetching note thread:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el hilo de notas" },
      { status: 500 }
    );
  }
}
