/**
 * CRM Apollo Prospecting Page
 * Búsqueda de contactos y empresas en Apollo (220M+ contactos)
 * La búsqueda de personas NO consume créditos Apollo.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { ApolloProspectingClient } from "@/components/crm/ApolloProspectingClient";

export default async function ApolloProspectingPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/crm/prospecting");
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "leads")) redirect("/crm");

  return (
    <>
      <PageHeader
        title="Prospección Apollo"
        description="Busca contactos y empresas en la base de 220M+ de Apollo. La búsqueda de personas no consume créditos."
      />
      <ApolloProspectingClient />
    </>
  );
}
