import { prisma } from "@/lib/prisma";
import { buildEmailUrl } from "@/lib/emails/site-url";

/**
 * URL del portal cliente con `email` para pre-llenar el campo de login.
 * `buildEmailUrl` se encarga de prefijar el dominio canónico y anexar
 * `?tenant={slug}&t={slug}` (alias legacy) para que el tenant-resolver
 * y los OG crawlers (p. ej. WhatsApp) puedan resolver sin sesión.
 */
export async function buildPortalClienteInviteUrl(opts: {
  email?: string | null;
  tenantId: string;
}): Promise<string> {
  const row = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: { slug: true },
  });
  const slug = row?.slug ?? null;
  const email = opts.email?.trim();
  const path = email
    ? `/portal/cliente?email=${encodeURIComponent(email)}`
    : "/portal/cliente";
  return buildEmailUrl(path, slug);
}
