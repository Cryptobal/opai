import type { Metadata } from "next";
import { TePublicForm } from "@/components/public/TePublicForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ingreso Turno Extra | OPAI",
  description:
    "Completa el formulario de ingreso como guardia de Turno Extra en OPAI.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Ingreso Turno Extra | OPAI",
    description:
      "Completa el formulario de ingreso como guardia de Turno Extra en OPAI.",
    type: "website",
    images: [
      {
        url: "/Logo%20Gard%20Blanco.png",
        width: 1200,
        height: 630,
        alt: "OPAI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ingreso Turno Extra | OPAI",
    description:
      "Completa el formulario de ingreso como guardia de Turno Extra en OPAI.",
    images: ["/Logo%20Gard%20Blanco.png"],
  },
};

export default function IngresoTePublicPage() {
  return <TePublicForm />;
}
