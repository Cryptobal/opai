"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  MapPin,
  Loader2,
  AlertTriangle,
  Users,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

  useEffect(() => {
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
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      {/* Geocoding progress bar */}
      {geocodingStats && (
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Geocoding: {geocodingStats.porcentaje}%
          </span>
          <Progress value={geocodingStats.porcentaje} className="flex-1 h-2" />
          <span className="text-[10px] text-muted-foreground">
            {geocodingStats.conCoordenadas}/{geocodingStats.total}
          </span>
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
              <p className="text-xs text-muted-foreground">Críticas (&lt;40)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.map((item) => (
          <Card
            key={item.installationId}
            className={`cursor-pointer transition-all hover:border-teal-500/40 ${
              selectedId === item.installationId ? "border-teal-500/60 ring-1 ring-teal-500/20" : ""
            }`}
            onClick={() => setSelectedId(
              selectedId === item.installationId ? null : item.installationId
            )}
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
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" />
                {item.totalGuardias} guardias · avg {item.distanciaPromedioKm}km
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selected detail */}
      {selected && (
        <Card className="border-teal-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-teal-400" />
              {selected.name}
              <span className={`font-mono ${getScoreColor(selected.scoreOptimizacion)}`}>
                Score: {selected.scoreOptimizacion}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                <p className="text-lg font-bold text-emerald-400">{selected.anillos.cercanos_0_5km}</p>
                <p className="text-[10px] text-muted-foreground">🟢 &lt;5km</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-center">
                <p className="text-lg font-bold text-amber-400">{selected.anillos.medianos_5_15km}</p>
                <p className="text-[10px] text-muted-foreground">🟡 5-15km</p>
              </div>
              <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3 text-center">
                <p className="text-lg font-bold text-orange-400">{selected.anillos.lejanos_15_30km}</p>
                <p className="text-[10px] text-muted-foreground">🟠 15-30km</p>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-center">
                <p className="text-lg font-bold text-red-400">{selected.anillos.muyLejanos_30plus}</p>
                <p className="text-[10px] text-muted-foreground">🔴 &gt;30km</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Promedio: {selected.distanciaPromedioKm}km</span>
              <span>Máximo: {selected.distanciaMaxKm}km</span>
              {selected.sinCoordenadas > 0 && (
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  {selected.sinCoordenadas} sin coordenadas
                </span>
              )}
            </div>

            {selected.alertas && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2">
                <p className="text-[10px] text-amber-400">{selected.alertas}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
