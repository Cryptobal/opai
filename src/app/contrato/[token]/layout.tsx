import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Revisión de Contrato | OPAI",
  robots: { index: false, follow: false },
};

export default function ContratoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
