import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Convierte logo guardado en Setting a URL absoluta para og:image */
function resolveAbsoluteOgImageUrl(raw: string | undefined, siteBase: string): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("//")) return `https:${t.slice(2)}`;
  const base = siteBase.replace(/\/$/, "");
  const path = t.startsWith("/") ? t : `/${t}`;
  return `${base}${path}`;
}

function defaultSiteBase(): string {
  return getCanonicalSiteUrl();
}

/**
 * Metadata OG/Twitter para /portal/cliente según `t` (slug tenant) o, en su defecto, email de contacto.
 */
export async function getPortalClientePageMetadata(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<Metadata> {
  const tSlug =
    firstString(searchParams.t)?.trim() ||
    firstString(searchParams.tenant)?.trim() ||
    null;
  const emailRaw = firstString(searchParams.email)?.trim();

  let tenantId: string | null = null;

  if (tSlug) {
    const tenant = await prisma.tenant.findFirst({
      where: { slug: tSlug, active: true },
      select: { id: true },
    });
    tenantId = tenant?.id ?? null;
  }

  if (!tenantId && emailRaw) {
    const normalized = decodeURIComponent(emailRaw).trim();
    const contact = await prisma.crmContact.findFirst({
      where: {
        email: { equals: normalized, mode: "insensitive" },
      },
      select: { tenantId: true },
      orderBy: { updatedAt: "desc" },
    });
    tenantId = contact?.tenantId ?? null;
  }

  const siteBase = defaultSiteBase();
  const fallbackOg = `${siteBase}/icons/og-image.png`;

  if (!tenantId) {
    return {
      title: "OPAI — Portal Cliente",
      description: "Portal de clientes de seguridad.",
      openGraph: {
        title: "OPAI — Portal Cliente",
        description: "Portal de clientes de seguridad.",
        type: "website",
        siteName: "OPAI",
        images: [{ url: fallbackOg, width: 1200, height: 630, alt: "OPAI" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "OPAI — Portal Cliente",
        description: "Portal de clientes de seguridad.",
        images: [fallbackOg],
      },
    };
  }

  const cfg = await getTenantCompanyConfig(tenantId);
  const brandTitle =
    cfg.commercialName?.trim() || cfg.companyName?.trim() || "Portal Cliente";
  const description =
    cfg.brandingTagline?.trim() ||
    `Acceso seguro al portal de ${brandTitle}`;
  const rawImage =
    cfg.brandingLogoFull?.trim() ||
    cfg.brandingLogoDark?.trim() ||
    cfg.brandingLogoWhite?.trim() ||
    cfg.brandingLogoIcon?.trim() ||
    null;
  const ogImageUrl =
    resolveAbsoluteOgImageUrl(rawImage || undefined, siteBase) || fallbackOg;

  const pageTitle = `${brandTitle} — Portal Cliente`;

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: pageTitle,
      description,
      type: "website",
      siteName: brandTitle,
      images: [{ url: ogImageUrl, alt: brandTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [ogImageUrl],
    },
  };
}
