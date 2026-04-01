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
import { PhotoGallery } from "@/components/supervision/PhotoGallery";
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

  // Try with full includes (new supervision tables). Fall back to safe
  // select-only query if migration 20260401000000_supervision_module_refactor
  // hasn't been applied yet (avoids selecting new columns/relations that
  // don't exist in the database).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let visit: any = null;

  try {
    visit = await (prisma.opsVisitaSupervision as any).findFirst({
      where: {
        id,
        tenantId,
        ...(canViewAll ? {} : { supervisorId: session.user.id }),
      },
      include: {
        installation: { select: { name: true, address: true, commune: true } },
        supervisor: { select: { name: true, email: true } },
        images: { orderBy: [{ createdAt: "desc" }] },
        guardEvaluations: { orderBy: [{ createdAt: "asc" }] },
        findings: { orderBy: [{ createdAt: "desc" }] },
        photos: { orderBy: [{ takenAt: "asc" }] },
      },
    });
  } catch {
    // New columns/tables don't exist — use select with only safe columns
    const base = await prisma.opsVisitaSupervision.findFirst({
      where: {
        id,
        tenantId,
        ...(canViewAll ? {} : { supervisorId: session.user.id }),
      },
      select: {
        id: true,
        tenantId: true,
        supervisorId: true,
        installationId: true,
        checkInAt: true,
        checkInLat: true,
        checkInLng: true,
        checkInGeoValidada: true,
        checkInDistanciaM: true,
        checkOutAt: true,
        checkOutLat: true,
        checkOutLng: true,
        checkOutGeoValidada: true,
        checkOutDistanciaM: true,
        status: true,
        generalComments: true,
        guardsCounted: true,
        installationState: true,
        ratings: true,
        documentChecklist: true,
        startedVia: true,
        completedVia: true,
        createdAt: true,
        updatedAt: true,
        installation: { select: { name: true, address: true, commune: true } },
        supervisor: { select: { name: true, email: true } },
        images: { orderBy: [{ createdAt: "desc" }] },
      },
    });
    if (base) {
      visit = {
        ...base,
        durationMinutes: null,
        guardsExpected: null,
        guardsFound: null,
        bookUpToDate: null,
        bookLastEntryDate: null,
        bookPhotoUrl: null,
        bookNotes: null,
        clientContacted: false,
        clientContactName: null,
        clientSatisfaction: null,
        clientComment: null,
        clientValidationUrl: null,
        healthScore: null,
        isExpressFlagged: false,
        draftData: null,
        wizardStep: 1,
        guardEvaluations: [],
        findings: [],
        verifiedFindings: [],
        checklistResults: [],
        photos: [],
      } as unknown as typeof visit;
    }
  }

  if (!visit) {
    notFound();
  }

  const ratings = (visit.ratings as Record<string, number> | null) ?? null;

  return (
    <div className="space-y-6 min-w-0">
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
          <CardContent className="space-y-2 text-sm sm:text-base">
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
              <span className="text-muted-foreground">Guardias esperados:</span>{" "}
              {visit.guardsExpected ?? "N/D"}
            </p>
            <p>
              <span className="text-muted-foreground">Guardias encontrados:</span>{" "}
              {visit.guardsFound ?? visit.guardsCounted ?? "N/D"}
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
          <CardContent className="space-y-2 text-sm sm:text-base">
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
          <CardContent className="space-y-2 text-sm sm:text-base">
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

      {/* Guard evaluations */}
      {visit.guardEvaluations && visit.guardEvaluations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluación individual de guardias ({visit.guardEvaluations.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm sm:text-base">
            {visit.guardEvaluations.map((ev: { id: string; guardName: string; isReinforcement: boolean; presentationScore: number | null; orderScore: number | null; protocolScore: number | null; observation: string | null }) => (
              <div key={ev.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{ev.guardName}</p>
                  {ev.isReinforcement && <Badge variant="warning" className="text-xs">Refuerzo</Badge>}
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
                  <span>Presentación: <strong>{ev.presentationScore ?? "—"}</strong>/5</span>
                  <span>Orden: <strong>{ev.orderScore ?? "—"}</strong>/5</span>
                  <span>Protocolo: <strong>{ev.protocolScore ?? "—"}</strong>/5</span>
                </div>
                {ev.observation && (
                  <p className="mt-1 text-sm text-muted-foreground">{ev.observation}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluación y comentarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm sm:text-base">
            <p>
              <span className="text-muted-foreground">Presentación:</span> {ratings?.presentacion ?? "N/D"}
            </p>
            <p>
              <span className="text-muted-foreground">Orden:</span> {ratings?.orden ?? "N/D"}
            </p>
            <p>
              <span className="text-muted-foreground">Protocolo:</span> {ratings?.protocolo ?? "N/D"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* General comments */}
      {visit.generalComments && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comentarios generales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap rounded-md border p-3 text-sm sm:text-base">
              {visit.generalComments}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Findings */}
      {visit.findings && visit.findings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hallazgos ({visit.findings.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm sm:text-base">
            {visit.findings.map((f: { id: string; category: string; severity: string; description: string; status: string }) => (
              <div key={f.id} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={f.severity === "critical" ? "destructive" : f.severity === "major" ? "warning" : "secondary"} className="text-xs">
                    {f.severity === "critical" ? "Crítico" : f.severity === "major" ? "Mayor" : "Menor"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{f.category}</Badge>
                  <Badge variant={f.status === "open" ? "warning" : f.status === "verified" ? "success" : "secondary"} className="text-xs">
                    {f.status}
                  </Badge>
                </div>
                <p className="mt-1">{f.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Book / Logbook info */}
      {visit.bookUpToDate !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Libro de novedades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm sm:text-base">
            <p>
              <span className="text-muted-foreground">Al día:</span>{" "}
              {visit.bookUpToDate ? "Sí" : "No"}
            </p>
            {visit.bookLastEntryDate && (
              <p>
                <span className="text-muted-foreground">Última entrada:</span>{" "}
                {new Date(visit.bookLastEntryDate).toLocaleDateString("es-CL")}
              </p>
            )}
            {visit.bookNotes && (
              <p>
                <span className="text-muted-foreground">Novedades:</span> {visit.bookNotes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Duration and express flag */}
      {visit.durationMinutes != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Duración</CardTitle>
          </CardHeader>
          <CardContent className="text-sm sm:text-base">
            <p>
              {visit.durationMinutes} minutos
              {visit.isExpressFlagged && (
                <Badge variant="warning" className="ml-2 text-xs">Visita express</Badge>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidencia fotográfica</CardTitle>
        </CardHeader>
        <CardContent>
          <PhotoGallery
            photos={
              visit.photos && visit.photos.length > 0
                ? visit.photos.map((p: { id: string; photoUrl: string; categoryName: string | null }) => ({
                    id: p.id,
                    url: p.photoUrl,
                    alt: p.categoryName ?? "Evidencia",
                    categoryName: p.categoryName,
                  }))
                : visit.images.map((img: { id: string; publicUrl: string; caption: string | null }) => ({
                    id: img.id,
                    url: img.publicUrl,
                    alt: img.caption ?? "Evidencia",
                    categoryName: null,
                  }))
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
