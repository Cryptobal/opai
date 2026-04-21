import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

/**
 * PATCH — Client updates one of their own pending suggestions.
 * DELETE — Client discards one of their own pending suggestions.
 *
 * Auth mirrors the POST endpoint: accept either `contractClientToken`
 * (public review link) or an authenticated portal-cliente session with
 * the suggestion's document tenant.
 *
 * Only `status = "pending"` suggestions are mutable. Once the company has
 * approved/rejected a suggestion, the client can no longer change it.
 */

type MutationContext = { id: string };

async function loadSuggestionForClient(
  suggestionId: string,
  contractClientToken: string | null,
) {
  const suggestion = await prisma.contractSuggestion.findUnique({
    where: { id: suggestionId },
    select: {
      id: true,
      tenantId: true,
      documentId: true,
      status: true,
      document: {
        select: { contractClientToken: true, tenantId: true },
      },
    },
  });
  if (!suggestion) return { error: "Sugerencia no encontrada", status: 404 as const };

  if (contractClientToken) {
    if (suggestion.document.contractClientToken !== contractClientToken) {
      return { error: "No autorizado", status: 403 as const };
    }
    return { suggestion };
  }

  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value,
  );
  if (!session) return { error: "No autenticado", status: 401 as const };
  if (session.tenantId !== suggestion.tenantId) {
    return { error: "No autorizado", status: 403 as const };
  }
  return { suggestion };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<MutationContext> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      contractClientToken,
      suggestedContent,
      clientNote,
    }: {
      contractClientToken?: string;
      suggestedContent?: string;
      clientNote?: string | null;
    } = body ?? {};

    if (typeof suggestedContent !== "string" || !suggestedContent.trim()) {
      return NextResponse.json(
        { success: false, error: "La propuesta no puede estar vacía" },
        { status: 400 },
      );
    }

    const loaded = await loadSuggestionForClient(id, contractClientToken ?? null);
    if ("error" in loaded) {
      return NextResponse.json({ success: false, error: loaded.error }, { status: loaded.status });
    }

    if (loaded.suggestion.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Esta sugerencia ya fue resuelta por el ejecutivo" },
        { status: 400 },
      );
    }

    const updated = await prisma.contractSuggestion.update({
      where: { id },
      data: {
        suggestedContent: suggestedContent.trim(),
        clientNote: clientNote != null ? String(clientNote).trim() || null : undefined,
      },
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
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[contract-suggestions PATCH] error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<MutationContext> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    // Support both query-string and body for the token (DELETE with body is
    // allowed but awkward on some clients; query is easier from fetch()).
    let contractClientToken = searchParams.get("contractClientToken");
    if (!contractClientToken) {
      const body = await request.json().catch(() => null);
      contractClientToken = body?.contractClientToken ?? null;
    }

    const loaded = await loadSuggestionForClient(id, contractClientToken);
    if ("error" in loaded) {
      return NextResponse.json({ success: false, error: loaded.error }, { status: loaded.status });
    }

    if (loaded.suggestion.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Esta sugerencia ya fue resuelta por el ejecutivo" },
        { status: 400 },
      );
    }

    await prisma.contractSuggestion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[contract-suggestions DELETE] error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
