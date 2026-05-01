"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, RefreshCw, MapPin, User, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Recommendation {
  type: "coverage" | "guard" | "schedule" | "template";
  priority: "high" | "medium" | "low";
  text: string;
}

const PRIORITY_CONFIG = {
  high: { label: "ALTA", cls: "bg-status-danger-soft text-status-danger-fg", dot: "bg-status-danger" },
  medium: { label: "MEDIA", cls: "bg-status-warn-soft text-status-warn-fg", dot: "bg-status-warn" },
  low: { label: "BAJA", cls: "bg-status-info-soft text-status-info-fg", dot: "bg-status-info" },
};

const TYPE_ICONS = {
  coverage: MapPin,
  guard: User,
  schedule: Clock,
  template: FileText,
};

export function IaRecommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/rondas/ia/recommendations", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setRecommendations(json.data.recommendations);
        setGeneratedAt(json.data.generatedAt);
        setHasGenerated(true);
      } else {
        toast.error(json.error || "Error generando recomendaciones");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} hora${hours > 1 ? "s" : ""}`;
    return `hace ${Math.floor(hours / 24)} día(s)`;
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/15">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">Recomendaciones IA</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            disabled={loading}
            className="h-7 text-xs"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {hasGenerated ? "Regenerar" : "Generar"}
          </Button>
        </div>

        {loading && !hasGenerated && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Analizando datos de las últimas 4 semanas...
            </p>
          </div>
        )}

        {!loading && !hasGenerated && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Pulsa "Generar" para analizar los datos operacionales y obtener recomendaciones accionables.
            </p>
          </div>
        )}

        {hasGenerated && recommendations.length === 0 && !loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Sin datos suficientes para generar recomendaciones.
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="space-y-3">
            {recommendations.map((rec, i) => {
              const prio = PRIORITY_CONFIG[rec.priority];
              const Icon = TYPE_ICONS[rec.type] ?? FileText;
              return (
                <div
                  key={i}
                  className="p-3 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", prio.dot)} />
                    <Badge className={cn("text-[10px]", prio.cls)}>{prio.label}</Badge>
                    <Icon className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{rec.text}</p>
                </div>
              );
            })}
          </div>
        )}

        {generatedAt && (
          <p className="text-[10px] text-muted-foreground mt-3 text-right">
            Última generación: {timeAgo(generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
