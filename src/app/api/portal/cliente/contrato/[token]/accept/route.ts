import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST — Client accepts the contract (changes status to approved)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const document = await prisma.document.findFirst({
      where: { contractClientToken: token },
      select: {
        id: true,
        status: true,
        contractSuggestions: {
          where: { status: "pending" },
          select: { id: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Contrato no encontrado" },
        { status: 404 }
      );
    }

    // Cannot accept if there are pending suggestions
    if (document.contractSuggestions.length > 0) {
      return NextResponse.json(
        { success: false, error: "Hay sugerencias pendientes de resolver. No puede aceptar el contrato." },
        { status: 400 }
      );
    }

    // Cannot accept if already approved/active
    if (["approved", "active"].includes(document.status)) {
      return NextResponse.json(
        { success: false, error: "El contrato ya fue aceptado" },
        { status: 400 }
      );
    }

    // Update status to approved
    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: "portal_client",
      },
    });

    await prisma.docHistory.create({
      data: {
        documentId: document.id,
        action: "status_changed",
        details: { from: document.status, to: "approved", reason: "client_accepted" },
        createdBy: "portal_client",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error accepting contract:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
