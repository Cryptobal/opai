import Link from "next/link";
import { MapPin, Receipt, CalendarDays, ClipboardList, Clock3, Building2, Plus, BarChart3, Ticket, UserPlus } from "lucide-react";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SupervisorHubProps {
  tenantId: string;
  userId: string;
  firstName: string;
}

function formatDateTime(value: Date | null) {
  if (!value) return "Sin hora";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export async function SupervisorHub({ tenantId, userId, firstName }: SupervisorHubProps) {
  const today = new Date();
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayVisits, monthVisits, activeAssignments, recentVisits, pendingRendiciones] =
    await Promise.all([
      prisma.opsVisitaSupervision.count({
        where: {
          tenantId,
          supervisorId: userId,
          checkInAt: { gte: dayStart },
        },
      }),
      prisma.opsVisitaSupervision.count({
        where: {
          tenantId,
          supervisorId: userId,
          checkInAt: { gte: monthStart },
        },
      }),
      prisma.opsAsignacionSupervisor.findMany({
        where: {
          tenantId,
          supervisorId: userId,
          isActive: true,
        },
        include: {
          installation: {
            select: { id: true, name: true, address: true, commune: true },
          },
        },
        orderBy: [{ installation: { name: "asc" } }],
        take: 8,
      }),
      prisma.opsVisitaSupervision.findMany({
        where: {
          tenantId,
          supervisorId: userId,
        },
        include: {
          installation: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ checkInAt: "desc" }],
        take: 5,
      }),
      prisma.financeRendicion.count({
        where: {
          tenantId,
          submitterId: userId,
          status: { in: ["DRAFT", "SUBMITTED", "IN_APPROVAL"] },
        },
      }),
    ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Hola, {firstName}</CardTitle>
          <CardDescription>
            Hub de supervisión para trabajo en terreno: check-in, visitas y rendiciones.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="overflow-visible">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buscador global</CardTitle>
          <CardDescription>
            Busca en CRM (contactos, instalaciones), operaciones (guardias por nombre o RUT) y documentos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GlobalSearch />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Visitas hoy</p>
            <p className="text-2xl font-semibold">{todayVisits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Visitas mes</p>
            <p className="text-2xl font-semibold">{monthVisits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Instalaciones asignadas</p>
            <p className="text-2xl font-semibold">{activeAssignments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Rendiciones pendientes</p>
            <p className="text-2xl font-semibold">{pendingRendiciones}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button asChild className="justify-start bg-primary" size="lg">
            <Link href="/personas/guardias/ingreso-te">
              <UserPlus className="mr-2 h-4 w-4" /> Ingresar Guardia TE
            </Link>
          </Button>
          <Button asChild className="justify-start">
            <Link href="/ops/supervision/nueva-visita">
              <MapPin className="mr-2 h-4 w-4" /> Nueva visita
            </Link>
          </Button>
          <Button asChild variant="secondary" className="justify-start">
            <Link href="/finanzas/rendiciones/nueva">
              <Plus className="mr-2 h-4 w-4" /> Nueva rendición
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/finanzas/rendiciones">
              <Receipt className="mr-2 h-4 w-4" /> Mis rendiciones
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/ops/supervision/mis-visitas">
              <ClipboardList className="mr-2 h-4 w-4" /> Mis visitas
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/ops/supervision">
              <BarChart3 className="mr-2 h-4 w-4" /> Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/ops/tickets?view=create">
              <Ticket className="mr-2 h-4 w-4" /> Crear ticket
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/ops/pauta-mensual">
              <CalendarDays className="mr-2 h-4 w-4 text-white" /> Pauta mensual
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/ops/refuerzos">
              <Clock3 className="mr-2 h-4 w-4" /> Turnos de refuerzo
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mis instalaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay instalaciones asignadas.</p>
          ) : (
            activeAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{assignment.installation.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {assignment.installation.address ?? "Sin dirección"}
                    </p>
                  </div>
                  <Badge variant="outline">
                    <Building2 className="mr-1 h-3 w-3" />
                    {assignment.installation.commune ?? "N/D"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visitas recientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes visitas registradas.</p>
          ) : (
            recentVisits.map((visit) => (
              <div key={visit.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{visit.installation.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(visit.checkInAt)}</p>
                </div>
                <Badge variant={visit.status === "completed" ? "default" : "secondary"}>
                  <Clock3 className="mr-1 h-3 w-3" />
                  {visit.status}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
