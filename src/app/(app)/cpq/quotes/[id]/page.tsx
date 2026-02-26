/**
 * CPQ legacy route compatibility.
 * Old links used /cpq/quotes/:id, now canonical route is /crm/cotizaciones/:id.
 */

import { redirect } from "next/navigation";

export default async function CpqQuotesLegacyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/crm/cotizaciones/${id}`);
}
