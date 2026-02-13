import { RondaClient } from "./RondaClient";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function RondaPage({ params }: Props) {
  const { code } = await params;
  return <RondaClient code={code} />;
}

export const metadata = {
  title: "Rondas de Seguridad — Gard Security",
  description: "Control de rondas por checkpoints QR",
};
