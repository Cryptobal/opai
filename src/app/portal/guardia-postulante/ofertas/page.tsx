"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, ShieldCheck, Clock, DollarSign, Building } from "lucide-react";

interface JobOffer {
  id: string;
  titulo: string;
  descripcion: string;
  turno: string;
  region: string;
  commune: string | null;
  rentaMin: number | null;
  rentaMax: number | null;
  vacantes: number;
  requiereOS10: boolean;
  tenantName: string;
  installationName: string | null;
  matchScore: number | null;
  yaPostulado: boolean;
  etapa: string | null;
  createdAt: string;
}

const TURNO_LABELS: Record<string, string> = {
  "4x4_dia": "4x4 Día",
  "4x4_noche": "4x4 Noche",
  "5x2": "5x2",
  "6x1": "6x1",
  otro: "Otro",
};

export default function OfertasPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(true);

  const [filters, setFilters] = useState({ turno: "", region: "", rentaMin: "" });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.turno) params.set("turno", filters.turno);
      if (filters.region) params.set("region", filters.region);
      if (filters.rentaMin) params.set("rentaMin", filters.rentaMin);

      const res = await fetch(`/api/portal/ats/jobs?${params}`);
      if (res.status === 401) {
        setAuthenticated(false);
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json.success) setJobs(json.data);
    } catch {
      toast.error("Error al cargar ofertas");
    } finally {
      setLoading(false);
    }
  }, [filters.turno, filters.region, filters.rentaMin]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function apply(jobId: string) {
    setApplying(jobId);
    try {
      const res = await fetch(`/api/portal/ats/jobs/${jobId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      toast.success("Postulación enviada");
      fetchJobs();
    } catch {
      toast.error("Error de red");
    } finally {
      setApplying(null);
    }
  }

  function formatRenta(min: number | null, max: number | null) {
    if (!min && !max) return "No especificada";
    const fmt = (n: number) => `$${n.toLocaleString("es-CL")}`;
    if (min && max) return `${fmt(min)} — ${fmt(max)}`;
    return min ? `Desde ${fmt(min)}` : `Hasta ${fmt(max!)}`;
  }

  if (!authenticated) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">
          Debes iniciar sesión para ver ofertas.
        </p>
        <Button className="mt-4" onClick={() => router.push("/portal/guardia-postulante/registro")}>
          Registrarme
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Ofertas de empleo</h2>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filters.turno} onValueChange={(v) => setFilters((f) => ({ ...f, turno: v === "all" ? "" : v }))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Turno" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(TURNO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-[160px]"
          placeholder="Renta mínima"
          type="number"
          value={filters.rentaMin}
          onChange={(e) => setFilters((f) => ({ ...f, rentaMin: e.target.value }))}
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center">Cargando ofertas...</p>
      ) : jobs.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No hay ofertas disponibles con estos filtros.
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{job.titulo}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Building className="h-3.5 w-3.5" />
                    <span>{job.tenantName}</span>
                    {job.installationName && (
                      <>
                        <span>·</span>
                        <span>{job.installationName}</span>
                      </>
                    )}
                  </div>
                </div>
                {job.matchScore !== null && (
                  <div className="text-right">
                    <span className="text-sm font-medium">{job.matchScore}%</span>
                    <Progress value={job.matchScore} className="h-1.5 w-16 mt-1" />
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground line-clamp-2">{job.descripcion}</p>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {TURNO_LABELS[job.turno] ?? job.turno}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.commune ?? job.region}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {formatRenta(job.rentaMin, job.rentaMax)}
                </Badge>
                {job.requiereOS10 && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    OS10
                  </Badge>
                )}
              </div>

              {job.yaPostulado ? (
                <Badge variant="default">
                  Postulado {job.etapa ? `— ${job.etapa}` : ""}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={() => apply(job.id)}
                  disabled={applying === job.id}
                >
                  Postular
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
