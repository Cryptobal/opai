import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostulacionPublicForm } from "@/components/public/PostulacionPublicForm";
import { isValidPostulacionToken } from "@/lib/postulacion-token";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  if (!isValidPostulacionToken(token)) {
    return {
      title: "Postulación no disponible | OPAI",
      description: "Este enlace de postulación no es válido.",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: "Postulación Guardia | OPAI",
    description:
      "Completa el formulario de postulación de OPAI para iniciar tu proceso.",
    robots: { index: false, follow: false },
    openGraph: {
      title: "Postulación Guardia | OPAI",
      description:
        "Completa el formulario de postulación de OPAI para iniciar tu proceso.",
      type: "website",
      images: [
        {
          url: "/icons/og-image.png",
          width: 1200,
          height: 630,
          alt: "OPAI",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Postulación Guardia | OPAI",
      description:
        "Completa el formulario de postulación de OPAI para iniciar tu proceso.",
      images: ["/icons/og-image.png"],
    },
  };
}

function resolvePostulacionTenantSlug(
  searchParamTenant: string | string[] | undefined,
): string {
  // Prioridad: query param ?tenant=<slug> → env var → fallback "gard".
  // El query param permite compartir links multi-tenant; la env var permite
  // setear un default por deploy/tenant; "gard" se mantiene para no romper
  // los enlaces ya distribuidos.
  if (typeof searchParamTenant === "string" && searchParamTenant.trim()) {
    return searchParamTenant.trim();
  }
  if (Array.isArray(searchParamTenant) && searchParamTenant[0]?.trim()) {
    return searchParamTenant[0].trim();
  }
  const envSlug = process.env.OPAI_POSTULACION_TENANT_SLUG?.trim();
  if (envSlug) return envSlug;
  return "gard";
}

export default async function PostulacionPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ tenant?: string | string[] }>;
}) {
  const { token } = await params;
  const { tenant } = await searchParams;
  if (!isValidPostulacionToken(token)) {
    notFound();
  }
  const tenantSlug = resolvePostulacionTenantSlug(tenant);

  return <PostulacionPublicForm token={token} tenantSlug={tenantSlug} />;
}
