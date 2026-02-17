import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function MisVisitasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/mis-visitas");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const visitas = await prisma.opsVisitaSupervision.findMany({
    where: {
      tenantId,
      supervisorId: session.user.id,
    },
    include: {
      installation: { select: { name: true, commune: true } },
      images: { select: { id: true } },
    },
    orderBy: [{ checkInAt: "desc" }],
    take: 100,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mis visitas"
        description="Historial de visitas realizadas por el supervisor actual."
        actions={
          <Button asChild>
            <Link href="/ops/supervision/nueva-visita">Nueva visita</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visitas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no has registrado visitas.</p>
          ) : (
            visitas.map((visit) => (
              <Link
                key={visit.id}
                href={`/ops/supervision/${visit.id}`}
                className="block rounded-md border p-3 transition hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{visit.installation.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(visit.checkInAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {visit.images.length} imagen(es)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {visit.installationState && (
                      <Badge variant="outline">{visit.installationState}</Badge>
                    )}
                    <Badge variant={visit.status === "completed" ? "default" : "secondary"}>
                      {visit.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
