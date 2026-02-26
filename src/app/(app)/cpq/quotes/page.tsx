/**
 * CPQ legacy route compatibility.
 * Old links used /cpq/quotes, now canonical route is /crm/cotizaciones.
 */

import { redirect } from "next/navigation";

export default function CpqQuotesLegacyPage() {
  redirect("/crm/cotizaciones");
}
