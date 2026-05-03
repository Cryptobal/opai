// Página pública de CSAT (sin auth). El operador del ticket comparte
// el link /csat/<token> con el cliente; este responde sin login.

import CsatClient from "./CsatClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function CsatPage({ params }: PageProps) {
  const { token } = await params;
  return <CsatClient token={token} />;
}
