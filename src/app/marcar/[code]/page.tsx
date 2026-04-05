import { MarcacionClient } from "./MarcacionClient";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function MarcacionPage({ params }: Props) {
  const { code } = await params;
  return <MarcacionClient code={code} />;
}

export const metadata = {
  title: "Marcación de Asistencia — OPAI",
  description: "Sistema de marcación de asistencia digital",
};
