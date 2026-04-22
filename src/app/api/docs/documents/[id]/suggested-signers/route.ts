/**
 * API Route: GET /api/docs/documents/[id]/suggested-signers
 *
 * Returns the default signer list to pre-fill the "Enviar a firma" modal.
 * Convention used by the contract template:
 *   signature.signer_1 → LA EMPRESA (representante legal de la empresa propia)
 *   signature.signer_2..N → EL CLIENTE (representantes legales de la cuenta)
 *
 * Fuente de cada signer:
 *   - signer_1: settings empresa.repLegalNombre / repLegalRut / repLegalEmail.
 *   - signer_N (N>=2): tabla AccountRepresentanteLegal de la cuenta asociada.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { canDelete } from "@/lib/permissions";

function forbidden() {
  return NextResponse.json(
    { success: false, error: "No autorizado para esta acción" },
    { status: 403 }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "docs", "gestion")) return forbidden();

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, content: true },
    });
    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    // Find associated CRM account (contracts created from quotes have this).
    const accountAssoc = await prisma.docAssociation.findFirst({
      where: { documentId: id, entityType: "crm_account" },
      select: { entityId: true },
    });

    // Empresa rep legal — read from Settings (both new and legacy key formats).
    const empresaKeys = [
      "empresa.repLegalNombre",
      "empresa.repLegalRut",
      "empresa.repLegalEmail",
    ];
    const settingKeys = empresaKeys.flatMap((k) => [
      k,
      `empresa:${ctx.tenantId}:${k}`,
    ]);
    const settings = await prisma.setting.findMany({
      where: { tenantId: ctx.tenantId, key: { in: settingKeys } },
      select: { key: true, value: true },
    });
    const settingMap = new Map<string, string>();
    for (const s of settings) {
      const normalized = s.key.includes(":")
        ? s.key.replace(`empresa:${ctx.tenantId}:`, "")
        : s.key;
      settingMap.set(normalized, s.value);
    }
    const empresaName = settingMap.get("empresa.repLegalNombre") ?? "";
    const empresaRut = settingMap.get("empresa.repLegalRut") ?? "";
    const empresaEmail = settingMap.get("empresa.repLegalEmail") ?? "";

    // Account reps from canonical relation.
    const accountReps = accountAssoc?.entityId
      ? await prisma.accountRepresentanteLegal.findMany({
          where: { accountId: accountAssoc.entityId, tenantId: ctx.tenantId },
          select: { nombre: true, rut: true, email: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

    // Detect signer_N tokens used in the document so the suggested list
    // matches the template's expectations exactly.
    const signerOrders = new Set<number>();
    const SIGNER_PATTERN = /^signature\.signer_(\d+)$/;
    const collectFromContent = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(collectFromContent);
        return;
      }
      const n = node as { type?: string; attrs?: { tokenKey?: string }; content?: unknown };
      const tokenKey = n.attrs?.tokenKey;
      if (n.type === "contractToken" && typeof tokenKey === "string") {
        const m = tokenKey.match(SIGNER_PATTERN);
        if (m) signerOrders.add(Number(m[1]));
        if (tokenKey === "signature.placeholder") signerOrders.add(1);
      }
      if (n.content) collectFromContent(n.content);
    };
    collectFromContent(document.content);

    // Build the suggested list: signer_1 = empresa, signer_N>=2 = account reps.
    type Suggested = {
      name: string;
      rut: string;
      email: string;
      signingOrder: number;
      label: string;
    };
    const suggested: Suggested[] = [];

    suggested.push({
      name: empresaName,
      rut: empresaRut,
      email: empresaEmail,
      signingOrder: 1,
      label: "LA EMPRESA",
    });

    accountReps.forEach((rep, i) => {
      suggested.push({
        name: rep.nombre,
        rut: rep.rut,
        email: rep.email ?? "",
        signingOrder: 2 + i,
        label: i === 0 ? "EL CLIENTE" : `EL CLIENTE (${i + 1})`,
      });
    });

    // Trim to the orders the template actually uses, when detected.
    // If the template uses none (legacy template without signer tokens),
    // return all suggestions so the user can still pick.
    const filtered = signerOrders.size > 0
      ? suggested.filter((s) => signerOrders.has(s.signingOrder))
      : suggested;

    return NextResponse.json({ success: true, data: filtered });
  } catch (error) {
    console.error("[suggested-signers]", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar la sugerencia de firmantes" },
      { status: 500 }
    );
  }
}
