import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET — Fetch a contract document by its contractClientToken (public, no auth required)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const document = await prisma.document.findFirst({
      where: { contractClientToken: token },
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        effectiveDate: true,
        expirationDate: true,
        contractMetadata: true,
        contractSuggestions: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            clauseNumber: true,
            clauseTitle: true,
            originalContent: true,
            suggestedContent: true,
            clientNote: true,
            adminComment: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Contrato no encontrado" },
        { status: 404 }
      );
    }

    const metadata = (document.contractMetadata ?? {}) as Record<string, unknown>;
    const reviewSubmittedAt =
      typeof metadata.reviewSubmittedAt === "string"
        ? (metadata.reviewSubmittedAt as string)
        : null;

    return NextResponse.json({
      success: true,
      data: {
        document: {
          id: document.id,
          title: document.title,
          content: document.content,
          status: document.status,
          effectiveDate: document.effectiveDate,
          expirationDate: document.expirationDate,
          contractMetadata: document.contractMetadata,
          reviewSubmittedAt,
        },
        suggestions: document.contractSuggestions,
      },
    });
  } catch (error) {
    console.error("Error fetching contract by token:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
