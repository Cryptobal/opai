/**
 * Construye el nombre base (sin extensión) del PDF/XML de un DTE.
 * Formato: F<folio>-<Cliente>-<Instalacion>.
 *
 * Incluye cliente CRM e instalación cuando están disponibles para que el
 * receptor identifique fácilmente el archivo sin abrirlo. Si no hay
 * crmAccount/installation, cae a `dte.code` clásico (F<tipo>-<folio>).
 *
 * Cliente prioriza `name` (nombre comercial) por sobre `legalName` (razón
 * social) porque el usuario lo identifica más rápido.
 */
import { prisma } from "@/lib/prisma";

function sanitize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

export async function buildDteAttachmentBaseName(
  tenantId: string,
  dte: {
    code: string;
    folio: number;
    crmAccountId: string | null;
    installationId: string | null;
    receiverName: string;
  },
): Promise<string> {
  let clientName: string | null = null;
  if (dte.crmAccountId) {
    const acc = await prisma.crmAccount.findFirst({
      where: { id: dte.crmAccountId, tenantId },
      select: { name: true, legalName: true },
    });
    clientName = acc?.name ?? acc?.legalName ?? null;
  }
  if (!clientName) clientName = dte.receiverName;

  let installationName: string | null = null;
  if (dte.installationId) {
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: dte.installationId, tenantId },
      select: { name: true },
    });
    installationName = inst?.name ?? null;
  }

  const parts: string[] = [`F${dte.folio}`];
  if (clientName) parts.push(sanitize(clientName));
  if (installationName) parts.push(sanitize(installationName));
  if (parts.length === 1) return dte.code;
  return parts.join("-");
}
