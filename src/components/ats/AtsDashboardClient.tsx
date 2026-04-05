"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Users, Clock, CheckCircle, Plus, Eye, MoreHorizontal } from "lucide-react";
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
  const [filterEstado, setFilterEstado] = useState<string>("all");
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          {["all", "ACTIVO", "BORRADOR", "PAUSADO", "CERRADO"].map((estado) => (
            <Button
              key={estado}
              variant={filterEstado === estado ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterEstado(estado)}
            >
              {estado === "all" ? "Todos" : estado.charAt(0) + estado.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
        <Link href="/ops/ats/nuevo">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nuevo aviso
          </Button>
        </Link>
      </div>

      {/* Table */}
      <Card>
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
