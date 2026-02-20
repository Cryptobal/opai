import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getDefaultTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/opai";
import { OpsPautaMensualClient } from "@/components/ops";
import { OpsGlobalSearch } from "@/components/ops/OpsGlobalSearch";

export default async function OpsPautaMensualPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/pauta-mensual");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "pauta_mensual")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [clients, guardias] = await Promise.all([
    prisma.crmAccount.findMany({
      where: {
        tenantId,
        type: "client",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        rut: true,
        installations: {
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.opsGuardia.findMany({
      where: {
        tenantId,
        status: "active",
        isBlacklisted: false,
      },
      select: {
        id: true,
        code: true,
        persona: {
          select: {
            firstName: true,
            lastName: true,
            rut: true,
          },
        },
      },
      orderBy: [{ persona: { lastName: "asc" } }],
    }),
  ]);

  return (
    <div className="-mt-4 space-y-3">
      <PageHeader
        title="Pauta mensual"
        description="Genera el plan del mes y asigna guardias por puesto y día."
        className="mb-1"
      />
      <OpsPautaMensualClient
        initialClients={JSON.parse(JSON.stringify(clients))}
        guardias={JSON.parse(JSON.stringify(guardias))}
        currentUserId={session.user.id}
        globalSearchSlot={<OpsGlobalSearch className="w-full min-w-[180px] max-w-[200px] [&_input]:h-8" />}
      />
    </div>
  );
}
