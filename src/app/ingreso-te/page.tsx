import type { Metadata } from "next";
import { TePublicForm } from "@/components/public/TePublicForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ingreso Turno Extra | Gard Security",
  description:
    "Completa el formulario de ingreso como guardia de Turno Extra en Gard Security.",
  openGraph: {
    title: "Ingreso Turno Extra | Gard Security",
    description:
      "Completa el formulario de ingreso como guardia de Turno Extra en Gard Security.",
    type: "website",
    images: [
      {
        url: "/Logo%20Gard%20Blanco.png",
        width: 1200,
        height: 630,
        alt: "Gard Security",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ingreso Turno Extra | Gard Security",
    description:
      "Completa el formulario de ingreso como guardia de Turno Extra en Gard Security.",
    images: ["/Logo%20Gard%20Blanco.png"],
  },
};

export default function IngresoTePublicPage() {
  return <TePublicForm />;
}
