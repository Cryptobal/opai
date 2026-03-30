"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  MapPin,
  Loader2,
  AlertTriangle,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { IndiceGeograficoItem } from "./types";

export function IndiceGeografico() {
  const [data, setData] = useState<IndiceGeograficoItem[]>([]);
  const [resumen, setResumen] = useState<{
    totalInstalaciones: number;
    scorePromedio: number;
    instalacionesCriticas: number;
  } | null>(null);
  const [geocodingStats, setGeocodingStats] = useState<{
    total: number;
    conCoordenadas: number;
    sinCoordenadas: number;
    porcentaje: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geocodingBatch, setGeocodingBatch] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch("/api/ops/alertas-cobertura/indice-geografico").then((r) => r.json()),
      fetch("/api/ops/geocoding/stats").then((r) => r.json()).catch(() => null),
    ]).then(([geo, geoStats]) => {
      if (geo.success) {
        setData(geo.data);
        setResumen(geo.resumen);
      }
      if (geoStats?.success) {
        setGeocodingStats(geoStats.data || geoStats);
      }
      setLoading(false);
    }).catch(() => {
      toast.error("Error cargando índice geográfico");
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, []);

  const selected = selectedId ? data.find((d) => d.installationId === selectedId) : null;

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-emerald-400";
    if (score >= 40) return "text-amber-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return "bg-emerald-500/20 border-emerald-500/30";
    if (score >= 40) return "bg-amber-500/20 border-amber-500/30";
    return "bg-red-500/20 border-red-500/30";
  };

  const handleBatchGeocode = async () => {
    setGeocodingBatch(true);
    try {
      const res = await fetch("/api/ops/geocoding/batch", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        toast.success(`Geocoding: ${json.geocoded} OK, ${json.failed} fallidos de ${json.processed}`);
        fetchData(); // Refresh
      } else {
        toast.error(json.error || "Error en geocoding");
      }
    } catch {
      toast.error("Error en geocoding batch");
    } finally {
      setGeocodingBatch(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Geocoding progress */}
      {geocodingStats && (
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Geocoding: {geocodingStats.porcentaje}%
          </span>
          <Progress value={geocodingStats.porcentaje} className="flex-1 h-2" />
          <span className="text-[10px] text-muted-foreground">
            {geocodingStats.conCoordenadas}/{geocodingStats.total}
          </span>
          {geocodingStats.sinCoordenadas > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={handleBatchGeocode}
              disabled={geocodingBatch}
            >
              {geocodingBatch ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <MapPin className="h-3 w-3 mr-1" />
              )}
              Geocodificar pendientes
            </Button>
          )}
        </div>
      )}

      {/* Summary */}
      {resumen && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{resumen.totalInstalaciones}</p>
              <p className="text-xs text-muted-foreground">Instalaciones</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${getScoreColor(resumen.scorePromedio)}`}>
                {resumen.scorePromedio}
              </p>
              <p className="text-xs text-muted-foreground">Score Promedio</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-400">{resumen.instalacionesCriticas}</p>
              <p className="text-xs text-muted-foreground">Criticas (&lt;40)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.map((item) => (
          <Card
            key={item.installationId}
            className="cursor-pointer transition-all hover:border-teal-500/40"
            onClick={() => setSelectedId(item.installationId)}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div className={`text-2xl font-bold ${getScoreColor(item.scoreOptimizacion)}`}>
                  {item.scoreOptimizacion}
                </div>
                <Badge variant="outline" className={getScoreBg(item.scoreOptimizacion)}>
                  {item.scoreOptimizacion >= 70 ? "🟢" : item.scoreOptimizacion >= 40 ? "🟡" : "🔴"}
                </Badge>
              </div>
              <p className="text-sm font-medium truncate">{item.name}</p>
              {item.commune && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {item.commune}{item.city ? `, ${item.city}` : ""}
                </p>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" />
                {item.totalGuardias} guardias · avg {item.distanciaPromedioKm}km
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No hay instalaciones con coordenadas configuradas
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-teal-400" />
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  {selected.commune}{selected.city ? `, ${selected.city}` : ""} — Score:{" "}
                  <span className={`font-bold ${getScoreColor(selected.scoreOptimizacion)}`}>
                    {selected.scoreOptimizacion}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Distance rings */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-center">
                    <p className="text-lg font-bold text-emerald-400">{selected.anillos.cercanos_0_5km}</p>
                    <p className="text-[10px] text-muted-foreground">&lt;5km</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-center">
                    <p className="text-lg font-bold text-amber-400">{selected.anillos.medianos_5_15km}</p>
                    <p className="text-[10px] text-muted-foreground">5-15km</p>
                  </div>
                  <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-2.5 text-center">
                    <p className="text-lg font-bold text-orange-400">{selected.anillos.lejanos_15_30km}</p>
                    <p className="text-[10px] text-muted-foreground">15-30km</p>
                  </div>
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-center">
                    <p className="text-lg font-bold text-red-400">{selected.anillos.muyLejanos_30plus}</p>
                    <p className="text-[10px] text-muted-foreground">&gt;30km</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Promedio: {selected.distanciaPromedioKm}km</span>
                  <span>Maximo: {selected.distanciaMaxKm}km</span>
                  {selected.sinCoordenadas > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      {selected.sinCoordenadas} sin coordenadas
                    </span>
                  )}
                </div>

                {/* Guard list */}
                {selected.guardias && selected.guardias.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Guardias asignados ({selected.guardias.length})
                    </p>
                    <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800 max-h-60 overflow-y-auto">
                      {selected.guardias.map((g) => (
                        <div key={g.id} className="flex items-center justify-between px-3 py-2">
                          <span className="text-sm">{g.nombre}</span>
                          {g.distanciaKm != null ? (
                            <span className={`text-xs font-mono ${
                              g.distanciaKm <= 5 ? "text-emerald-400" :
                              g.distanciaKm <= 15 ? "text-amber-400" :
                              g.distanciaKm <= 30 ? "text-orange-400" : "text-red-400"
                            }`}>
                              {g.distanciaKm} km
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">Sin coords</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.alertas && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2">
                    <p className="text-[10px] text-amber-400">{selected.alertas}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
