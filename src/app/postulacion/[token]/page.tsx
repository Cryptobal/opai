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

export default async function PostulacionPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidPostulacionToken(token)) {
    notFound();
  }

  return <PostulacionPublicForm token={token} />;
}
