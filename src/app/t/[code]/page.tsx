import PublicTicketClient from "./PublicTicketClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function PublicTicketPage({ params }: PageProps) {
  const { code } = await params;
  return <PublicTicketClient code={code} />;
}
