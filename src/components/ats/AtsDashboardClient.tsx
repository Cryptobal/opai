"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Users,
  Clock,
  CheckCircle,
  Plus,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AtsJob {
  id: string;
  titulo: string;
  turno: string;
  region: string;
  commune: string | null;
  estado: string;
  vacantes: number;
  createdAt: string;
  installation: { id: string; name: string } | null;
  _count: { applications: number };
  channels: Array<{ canal: string; estado: string | null; activo: boolean }>;
}

interface Metricas {
  avisosActivos: number;
  postulantesTotales: number;
  enProceso: number;
  contratadosMes: number;
}

const ESTADO_COLORS: Record<string, string> = {
  BORRADOR: "bg-gray-100 text-gray-700",
  ACTIVO: "bg-green-100 text-green-700",
  PAUSADO: "bg-yellow-100 text-yellow-700",
  CERRADO: "bg-red-100 text-red-700",
};

const TURNO_LABELS: Record<string, string> = {
  "4x4_dia": "4×4 Día",
  "4x4_noche": "4×4 Noche",
  "5x2": "5×2",
  "6x1": "6×1",
  otro: "Otro",
};

export function AtsDashboardClient({
  initialJobs,
  metricas,
}: {
  initialJobs: AtsJob[];
  metricas: Metricas;
}) {
  const router = useRouter();
  const [filterEstado, setFilterEstado] = useState<string>("all");

  async function handlePublishBne(jobId: string) {
    const t = toast.loading("Publicando en BNE…");
    try {
      const res = await fetch(`/api/ops/ats/jobs/${jobId}/republicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addCanales: ["bne"] }),
      });
      const json = await res.json();
      toast.dismiss(t);
      if (!json.success) {
        toast.error(json.error || "No se pudo publicar en BNE");
        return;
      }
      const bneResult = json.data?.results?.find(
        (r: { canal: string; ok: boolean; error?: string }) =>
          r.canal === "bne",
      );
      if (bneResult?.ok) {
        toast.success("Aviso publicado en BNE");
      } else {
        toast.error(`BNE rechazó: ${bneResult?.error || "error desconocido"}`);
      }
      router.refresh();
    } catch {
      toast.dismiss(t);
      toast.error("Error de red");
    }
  }

  async function handleDelete(jobId: string, applications: number) {
    if (applications > 0) {
      toast.error("Este aviso tiene postulaciones. Usa 'Cerrar' en lugar de eliminar.");
      return;
    }
    if (!confirm("¿Eliminar este aviso? Esta acción no se puede deshacer.")) return;
    const res = await fetch(`/api/ops/ats/jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Aviso eliminado");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "No se pudo eliminar");
    }
  }
  const jobs =
    filterEstado === "all"
      ? initialJobs
      : initialJobs.filter((j) => j.estado === filterEstado);

  const metricCards = [
    { label: "Avisos activos", value: metricas.avisosActivos, icon: Briefcase, color: "text-blue-600" },
    { label: "Postulantes totales", value: metricas.postulantesTotales, icon: Users, color: "text-indigo-600" },
    { label: "En proceso", value: metricas.enProceso, icon: Clock, color: "text-amber-600" },
    { label: "Contratados (mes)", value: metricas.contratadosMes, icon: CheckCircle, color: "text-green-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metricCards.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="flex items-center gap-3">
              <m.icon className={`h-5 w-5 ${m.color}`} />
              <div>
                <p className="text-2xl font-semibold">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible scrollbar-hide">
          {["all", "ACTIVO", "BORRADOR", "PAUSADO", "CERRADO"].map((estado) => (
            <Button
              key={estado}
              variant={filterEstado === estado ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => setFilterEstado(estado)}
            >
              {estado === "all" ? "Todos" : estado.charAt(0) + estado.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
        <Link href="/ops/ats/nuevo" className="shrink-0 w-full sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" /> Nuevo aviso
          </Button>
        </Link>
      </div>

      {/* Móvil: tarjetas (evita tabla ancha ilegible) */}
      <div className="space-y-3 md:hidden">
        {jobs.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">No hay avisos</Card>
        )}
        {jobs.map((job) => (
          <Card key={job.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-sm leading-snug line-clamp-2">{job.titulo}</h3>
              <Badge className={`shrink-0 ${ESTADO_COLORS[job.estado] ?? ""}`} variant="secondary">
                {job.estado}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{TURNO_LABELS[job.turno] ?? job.turno}</span>
              <span>·</span>
              <span>{job.commune ?? job.region}</span>
              <span>·</span>
              <span>{new Date(job.createdAt).toLocaleDateString("es-CL")}</span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
              <div className="flex flex-wrap gap-1">
                {job.channels
                  .filter((c) => c.activo)
                  .slice(0, 4)
                  .map((c) => (
                    <Badge key={c.canal} variant="outline" className="text-[10px]">
                      {c.canal.replace("_", " ")}
                    </Badge>
                  ))}
                {job.channels.filter((c) => c.activo).length > 4 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{job.channels.filter((c) => c.activo).length - 4}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5 inline mr-0.5" />
                  {job._count.applications}
                </span>
                <Button variant="default" size="sm" className="h-8 text-xs" asChild>
                  <Link href={`/ops/ats/${job.id}`}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Pipeline
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop: tabla */}
      <Card className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Región</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-center">Postulantes</TableHead>
              <TableHead>Canales</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No hay avisos
                </TableCell>
              </TableRow>
            )}
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-medium max-w-[200px] truncate">
                  {job.titulo}
                </TableCell>
                <TableCell>{TURNO_LABELS[job.turno] ?? job.turno}</TableCell>
                <TableCell>{job.commune ?? job.region}</TableCell>
                <TableCell>
                  <Badge className={ESTADO_COLORS[job.estado] ?? ""} variant="secondary">
                    {job.estado}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{job._count.applications}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {job.channels
                      .filter((c) => c.activo)
                      .slice(0, 3)
                      .map((c) => (
                        <Badge key={c.canal} variant="outline" className="text-xs">
                          {c.canal.replace("_", " ")}
                        </Badge>
                      ))}
                    {job.channels.filter((c) => c.activo).length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{job.channels.filter((c) => c.activo).length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(job.createdAt).toLocaleDateString("es-CL")}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/ops/ats/${job.id}`}>
                          <Eye className="h-4 w-4 mr-2" /> Ver pipeline
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/ops/ats/${job.id}/editar`}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar aviso
                        </Link>
                      </DropdownMenuItem>
                      {job.estado === "ACTIVO" &&
                        !job.channels.some(
                          (c) => c.canal === "bne" && c.activo,
                        ) && (
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              handlePublishBne(job.id);
                            }}
                          >
                            <Send className="h-4 w-4 mr-2" /> Publicar en BNE
                          </DropdownMenuItem>
                        )}
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onSelect={(e) => {
                          e.preventDefault();
                          handleDelete(job.id, job._count.applications);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
