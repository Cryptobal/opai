/**
 * CRM Contacts Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { UserCircle } from "lucide-react";
import { CrmContactsClient } from "@/components/crm";

export default async function CrmContactsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/contacts");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "contacts")) redirect("/crm");
  const tenantId = session.user.tenantId;
  const [contacts, accounts] = await Promise.all([
    prisma.crmContact.findMany({
      where: { tenantId },
      include: { account: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  const initialContacts = JSON.parse(JSON.stringify(contacts));
  const initialAccounts = JSON.parse(JSON.stringify(accounts));

  return (
    <>
      <PageHero
        icon={<UserCircle />}
        iconTone="violet"
        title="Contactos"
        subtitle="personas clave por cliente"
        description="Directorio de contactos vinculados a cuentas. Cada contacto tiene su historial de comunicación, notas y deals asociados."
      />
      <CrmContactsClient
        initialContacts={initialContacts}
        accounts={initialAccounts}
      />
    </>
  );
}
