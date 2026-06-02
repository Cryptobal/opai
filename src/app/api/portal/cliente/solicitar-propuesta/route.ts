import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { notify } from "@/lib/notifications/notify";

/**
 * POST /api/portal/cliente/solicitar-propuesta
 *
 * El prospecto pide su propuesta personalizada desde la Presentación de Empresa
 * en el portal. Avisa al equipo comercial (lead caliente) con link a la cuenta.
 *
 * Body: { message?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePortalClienteAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const message =
      typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";

    const account = await prisma.crmAccount.findFirst({
      where: { id: auth.accountId, tenantId: auth.tenantId },
      select: { name: true },
    });
    const accountName = account?.name || auth.contactName || "Un prospecto";

    await notify({
      tenantId: auth.tenantId,
      type: "proposal_requested",
      audience: "admin",
      title: `${accountName} solicitó su propuesta`,
      body: `${auth.contactName} pidió una propuesta personalizada desde la presentación en el portal.${
        message ? ` Mensaje: "${message}"` : ""
      }`,
      link: `/crm/accounts/${auth.accountId}`,
      data: { contactId: auth.contactId, accountId: auth.accountId, source: "portal_presentation" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PORTAL] solicitar-propuesta:", error);
    return NextResponse.json(
      { success: false, error: "Error procesando la solicitud" },
      { status: 500 },
    );
  }
}
