import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { resolvePagePerms, canView, canEdit, canDelete, hasCapability } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VisitaDetailActions } from "@/components/supervision/VisitaDetailActions";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const INSTALLATION_STATE_LABELS: Record<string, string> = {
  normal: "Normal",
  incidencia: "Con observaciones",
  critico: "Crítico",
};

type Params = { id: string };

function formatDateTime(value: Date | null) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export default async function VisitaSupervisionDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const { id } = await params;
  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());
  const canViewAll = hasCapability(perms, "supervision_view_all");
  const userCanEdit = canEdit(perms, "ops", "supervision");
  const userCanDelete = canDelete(perms, "ops", "supervision") || canViewAll;

  const visit = await prisma.opsVisitaSupervision.findFirst({
    where: {
      id,
      tenantId,
      ...(canViewAll ? {} : { supervisorId: session.user.id }),
    },
    include: {
      installation: {
        select: { name: true, address: true, commune: true },
      },
      supervisor: {
        select: { name: true, email: true },
      },
      images: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  if (!visit) {
    notFound();
  }

  const ratings = (visit.ratings as Record<string, number> | null) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Visita ${visit.installation.name}`}
        description={`Check-in: ${formatDateTime(visit.checkInAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/ops/supervision">Volver</Link>
            </Button>
            <VisitaDetailActions
              visitId={visit.id}
              status={visit.status}
              canEdit={userCanEdit}
              canDelete={userCanDelete}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Supervisor:</span> {visit.supervisor.name}
            </p>
            <p>
              <span className="text-muted-foreground">Estado:</span>{" "}
              <Badge
                className="ml-2"
                variant={
                  visit.status === "completed"
                    ? "default"
                    : visit.status === "cancelled"
                      ? "destructive"
                      : "secondary"
                }
              >
                {STATUS_LABELS[visit.status] ?? visit.status}
              </Badge>
            </p>
            <p>
              <span className="text-muted-foreground">Check-in:</span> {formatDateTime(visit.checkInAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Check-out:</span> {formatDateTime(visit.checkOutAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Geo check-in:</span>{" "}
              {visit.checkInGeoValidada ? "Válida" : "Fuera de radio"}
              {visit.checkInDistanciaM != null ? ` (${Math.round(visit.checkInDistanciaM)}m)` : ""}
            </p>
            <p>
              <span className="text-muted-foreground">Guardias contados:</span>{" "}
              {visit.guardsCounted ?? "N/D"}
            </p>
            <p>
              <span className="text-muted-foreground">Estado instalación:</span>{" "}
              {visit.installationState
                ? INSTALLATION_STATE_LABELS[visit.installationState] ?? visit.installationState
                : "N/D"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instalación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{visit.installation.name}</p>
            <p className="text-muted-foreground">{visit.installation.address ?? "Sin dirección"}</p>
            <p className="text-muted-foreground">{visit.installation.commune ?? "Sin comuna"}</p>
          </CardContent>
        </Card>
      </div>

      {(visit as { documentChecklist?: Record<string, boolean> }).documentChecklist &&
        Object.keys((visit as { documentChecklist?: Record<string, boolean> }).documentChecklist!).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentos verificados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries((visit as { documentChecklist?: Record<string, boolean> }).documentChecklist!).map(
              ([code, present]) => (
                <p key={code}>
                  <span className="text-muted-foreground">
                    {code.replace(/_/g, " ")}:
                  </span>{" "}
                  {present ? "Presente" : "No presente"}
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluación y comentarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Presentación:</span> {ratings?.presentacion ?? "N/D"}
          </p>
          <p>
            <span className="text-muted-foreground">Orden:</span> {ratings?.orden ?? "N/D"}
          </p>
          <p>
            <span className="text-muted-foreground">Protocolo:</span> {ratings?.protocolo ?? "N/D"}
          </p>
          <p className="whitespace-pre-wrap rounded-md border p-3">
            {visit.generalComments ?? "Sin comentarios"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidencia fotográfica</CardTitle>
        </CardHeader>
        <CardContent>
          {visit.images.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin imágenes adjuntas.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visit.images.map((img) => (
                <a
                  key={img.id}
                  href={img.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-md border"
                >
                  <img src={img.publicUrl} alt={img.caption ?? "Evidencia"} className="h-40 w-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
