import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { OpsPautaMensualClient } from "@/components/ops";

export default async function OpsPautaMensualPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/pauta-mensual");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "pauta_mensual")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId;
  const role = session.user.role;

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
          where: { status: "active" },
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
        lifecycleStatus: { in: ["contratado", "te"] },
        persona: { laborClass: { not: "ADMINISTRATIVO" } },
      },
      select: {
        id: true,
        code: true,
        lifecycleStatus: true,
        persona: {
          select: { firstName: true, lastName: true, rut: true },
        },
      },
      orderBy: [{ persona: { lastName: "asc" } }],
    }),
  ]);

  return (
    <div className="min-w-0">
      <OpsPautaMensualClient
        initialClients={JSON.parse(JSON.stringify(clients))}
        guardias={JSON.parse(JSON.stringify(guardias))}
        userRole={role}
        currentUserId={session.user.id}
      />
    </div>
  );
}
