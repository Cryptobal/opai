import type { Metadata } from "next";
import { MarcacionClient } from "./MarcacionClient";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function MarcacionPage({ params }: Props) {
  const { code } = await params;
  return <MarcacionClient code={code} />;
}

export const metadata: Metadata = {
  title: "Marcación de Asistencia — OPAI",
  description: "Sistema de marcación de asistencia digital",
  robots: { index: false, follow: false },
};
