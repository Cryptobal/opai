import { prisma } from "@/lib/prisma";

function portalClienteBasePath(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ""}/portal/cliente`;
}

/**
 * URL del portal cliente con `email` y `t` (slug del tenant) para que crawlers (p. ej. WhatsApp)
 * puedan resolver Open Graph con el logo del tenant sin sesión.
 */
export async function buildPortalClienteInviteUrl(opts: {
  email?: string | null;
  tenantId: string;
}): Promise<string> {
  const qs = new URLSearchParams();
  if (opts.email?.trim()) qs.set("email", opts.email.trim());
  const row = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: { slug: true },
  });
  if (row?.slug) qs.set("t", row.slug);
  const q = qs.toString();
  const b = portalClienteBasePath();
  return q ? `${b}?${q}` : b;
}
