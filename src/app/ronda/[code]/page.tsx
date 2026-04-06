import type { Metadata } from "next";
import { RondaClient } from "./RondaClient";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function RondaPage({ params }: Props) {
  const { code } = await params;
  return <RondaClient code={code} />;
}

export const metadata: Metadata = {
  title: "Rondas de Seguridad — OPAI",
  description: "Control de rondas por checkpoints QR",
  robots: { index: false, follow: false },
};
