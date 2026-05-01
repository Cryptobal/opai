"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface ArcoItem {
  id: string;
  createdAt: string;
  guardiaId: string | null;
  action: string;
  tipo: string;
  detalle: string;
  campos: string[];
  estado: "pendiente" | "resuelta";
  fechaLimiteRespuesta: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolucion: string | null;
}

type Filter = "pendiente" | "resuelta" | "all";

const TIPO_LABELS: Record<string, string> = {
  rectificacion: "Rectificación",
  supresion: "Supresión",
  oposicion: "Oposición",
  bloqueo: "Bloqueo",
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CL") : "—";

const daysLeft = (limit: string | null) => {
  if (!limit) return null;
  const diff = new Date(limit).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
};

export function ArcoAdminClient() {
  const [filter, setFilter] = useState<Filter>("pendiente");
  const [items, setItems] = useState<ArcoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolucion, setResolucion] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/arco?estado=${filter}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItems(json.data);
    } catch {
      toast.error("No se pudieron cargar las solicitudes");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleResolve = async (id: string) => {
    if (!resolucion.trim()) {
      toast.error("Describe la resolución");
      return;
    }
    try {
      const res = await fetch("/api/admin/arco", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolucion }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Solicitud marcada como resuelta");
      setResolving(null);
      setResolucion("");
      fetchItems();
    } catch {
      toast.error("No se pudo resolver");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["pendiente", "resuelta", "all"] as Filter[]).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Todas" : f === "pendiente" ? "Pendientes" : "Resueltas"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay solicitudes en este estado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const dl = daysLeft(item.fechaLimiteRespuesta);
            const isOverdue = item.estado === "pendiente" && dl !== null && dl < 0;
            const isUrgent = item.estado === "pendiente" && dl !== null && dl >= 0 && dl <= 7;
            return (
              <Card key={item.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{TIPO_LABELS[item.tipo] ?? item.tipo}</Badge>
                        <Badge variant={item.estado === "resuelta" ? "secondary" : "default"}>
                          {item.estado}
                        </Badge>
                        {isOverdue && <Badge variant="destructive">Vencida</Badge>}
                        {isUrgent && !isOverdue && (
                          <Badge className="bg-status-warn">Urgente ({dl}d)</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Solicitada: {fmtDate(item.createdAt)}
                      </p>
                      {item.fechaLimiteRespuesta && (
                        <p className="text-xs text-muted-foreground">
                          Plazo legal: {fmtDate(item.fechaLimiteRespuesta)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Guardia ID: <code>{item.guardiaId}</code>
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Detalle</p>
                    <p className="text-sm whitespace-pre-wrap">{item.detalle}</p>
                    {item.campos.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Campos: {item.campos.join(", ")}
                      </p>
                    )}
                  </div>

                  {item.estado === "resuelta" && (
                    <div className="border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        Resuelta el {fmtDate(item.resolvedAt)} por {item.resolvedBy}
                      </p>
                      <p className="text-sm mt-1">{item.resolucion}</p>
                    </div>
                  )}

                  {item.estado === "pendiente" && (
                    <>
                      {resolving === item.id ? (
                        <div className="space-y-2 border-t pt-3">
                          <Textarea
                            placeholder="Describe cómo se resolvió la solicitud (obligatorio)"
                            value={resolucion}
                            onChange={(e) => setResolucion(e.target.value)}
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleResolve(item.id)}>
                              Confirmar resolución
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setResolving(null);
                                setResolucion("");
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResolving(item.id)}
                        >
                          Marcar como resuelta
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
