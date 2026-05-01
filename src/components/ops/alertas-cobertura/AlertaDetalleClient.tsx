"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  MapPin,
  Clock,
  DollarSign,
  User,
  Phone,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Shield,
  AlertTriangle,
  Users,
  Bell,
  MessageCircle,
  Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CountdownTimer } from "./CountdownTimer";
import type { AlertaDetalle } from "./types";
import { ESTADO_BADGE, URGENCIA_BADGE, formatClp } from "./types";

interface Props {
  alertaId: string;
  tenantId: string;
}

export function AlertaDetalleClient({ alertaId, tenantId }: Props) {
  const router = useRouter();
  const [alerta, setAlerta] = useState<AlertaDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAlerta = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/alertas-cobertura/${alertaId}`);
      const json = await res.json();
      if (json.success) {
        setAlerta(json.data);
      } else {
        toast.error(json.error || "Error al obtener alerta");
      }
    } catch {
      toast.error("Error al obtener alerta");
    } finally {
      setLoading(false);
    }
  }, [alertaId]);

  useEffect(() => {
    fetchAlerta();
  }, [fetchAlerta]);

  // Pusher real-time
  useEffect(() => {
    if (!tenantId) return;
    let channel: any = null;
    let pusherInstance: any = null;

    import("pusher-js").then((PusherModule) => {
      const Pusher = PusherModule.default;
      pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      });
      channel = pusherInstance.subscribe(`alertas-cobertura-${tenantId}`);
      channel.bind("oleada-activada", () => fetchAlerta());
      channel.bind("alerta-aceptada", () => fetchAlerta());
      channel.bind("alerta-pendiente-confirmacion", () => fetchAlerta());
    });

    return () => {
      if (channel) { channel.unbind_all(); channel.unsubscribe(); }
      if (pusherInstance) pusherInstance.disconnect();
    };
  }, [tenantId, fetchAlerta]);

  const handleCancelar = async () => {
    if (!confirm("¿Cancelar esta alerta de cobertura?")) return;
    try {
      const res = await fetch(`/api/ops/alertas-cobertura/${alertaId}?action=cancelar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Cancelada manualmente" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Alerta cancelada");
        fetchAlerta();
      } else {
        toast.error(json.error || "Error al cancelar");
      }
    } catch {
      toast.error("Error al cancelar alerta");
    }
  };

  const handleConfirmar = async (sePresentó: boolean) => {
    try {
      if (sePresentó) {
        const res = await fetch(`/api/ops/alertas-cobertura/${alertaId}?action=confirmar`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asignacionPauta: "AUTOMATICA" }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success("Guardia confirmado — alerta completada");
          fetchAlerta();
        } else {
          toast.error(json.error || "Error al confirmar");
        }
      } else {
        const res = await fetch(`/api/ops/alertas-cobertura/${alertaId}?action=re-alertar`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: "Guardia no se presentó" }),
        });
        const json = await res.json();
        if (json.success) {
          toast.warning("Re-alertando — buscando nuevo guardia");
          fetchAlerta();
        } else {
          toast.error(json.error || "Error al re-alertar");
        }
      }
    } catch {
      toast.error("Error al procesar");
    }
  };

  const handleReAlertar = async () => {
    try {
      const res = await fetch(`/api/ops/alertas-cobertura/${alertaId}?action=re-alertar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Re-alerta manual" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Re-alerta iniciada");
        fetchAlerta();
      } else {
        toast.error(json.error || "Error");
      }
    } catch {
      toast.error("Error al re-alertar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!alerta) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertTriangle className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Alerta no encontrada</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/ops/alertas-cobertura")}>
          Volver
        </Button>
      </div>
    );
  }

  const estadoBadge = ESTADO_BADGE[alerta.estado] ?? { label: alerta.estado, className: "" };
  const urgenciaBadge = alerta.urgencia ? URGENCIA_BADGE[alerta.urgencia] : null;
  const guardia = alerta.aceptadaPorGuardia;
  const nombreGuardia = guardia ? `${guardia.persona.firstName} ${guardia.persona.lastName}` : null;
  const guardiasUnicosNotificados = alerta.notificaciones
    ? new Set(alerta.notificaciones.map((n) => n.guardiaId)).size
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/ops/alertas-cobertura")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{alerta.installation?.name ?? (alerta.libreComuna ? `Cobertura — ${alerta.libreComuna}` : (alerta.libreAddress ?? "Cobertura"))}</h1>
              <Badge variant="outline" className={estadoBadge.className}>
                {estadoBadge.label}
              </Badge>
              {urgenciaBadge && (
                <Badge variant="outline" className={urgenciaBadge.className}>
                  {urgenciaBadge.label}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta #{alerta.id.slice(0, 8)} · Creada {format(new Date(alerta.createdAt), "dd MMM yyyy HH:mm", { locale: es })}
            </p>
          </div>
        </div>
      </div>

      {/* Guardia aceptada banner */}
      {guardia && (alerta.estado === "ACEPTADA" || alerta.estado === "PENDIENTE_CONFIRMACION") && (
        <Card className="border-status-ok-border bg-status-ok-soft">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-ok-fg" />
                  <span className="font-medium">{nombreGuardia}</span>
                  {alerta.esInternoAceptacion === false && (
                    <Badge variant="outline" className="bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30 text-[10px]">
                      Externo
                    </Badge>
                  )}
                </div>
                {guardia.persona.phone && (
                  <div className="flex items-center gap-3 text-xs">
                    <a href={`tel:${guardia.persona.phone}`} className="text-status-info-fg hover:underline flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {guardia.persona.phone}
                    </a>
                    <a
                      href={`https://wa.me/56${guardia.persona.phone.replace(/\D/g, "").replace(/^56/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-status-ok-fg hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-status-ok hover:brightness-110" onClick={() => handleConfirmar(true)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Sí se presentó
                </Button>
                <Button variant="outline" size="sm" className="text-status-danger-fg" onClick={() => handleConfirmar(false)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Re-Alertar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Información</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dirección</span>
              <span className="text-right text-xs">{alerta.installation?.address || alerta.libreAddress || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modalidad</span>
              <span>{alerta.modalidad}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monto</span>
              <span className="font-mono text-status-ok-fg">{formatClp(alerta.montoOfrecido)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Horario</span>
              <span className="text-xs">
                {format(new Date(alerta.fechaInicio), "dd MMM HH:mm", { locale: es })} — {format(new Date(alerta.fechaFin), "dd MMM HH:mm", { locale: es })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Funciones</span>
              <span className="text-xs text-right max-w-[60%]">{alerta.funciones}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Creada por</span>
              <span className="text-xs">{alerta.creadaPor.name}</span>
            </div>
            {alerta.proximaOleadaAt && alerta.estado === "ACTIVA" && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Próxima oleada</span>
                <CountdownTimer targetDate={alerta.proximaOleadaAt} size="sm" />
              </div>
            )}
            {alerta._count && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Notificados</span>
                <span>
                  {alerta._count.notificaciones}
                  {alerta.notificaciones && alerta.notificaciones.length > 0 && (
                    <span className="text-muted-foreground text-[10px] ml-1">
                      ({guardiasUnicosNotificados} guardias)
                    </span>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Oleadas Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Oleadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(alerta.oleadasLog || []).map((log, i) => {
                const isActive = i === alerta.oleadaActual && alerta.estado === "ACTIVA";
                const isCompleted = i < alerta.oleadaActual || alerta.estado !== "ACTIVA";
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="relative flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full border-2 ${
                          isActive
                            ? "border-status-info-border bg-status-info-soft animate-pulse"
                            : isCompleted
                            ? "border-status-ok-border bg-status-ok"
                            : "border-muted-foreground/30 bg-transparent"
                        }`}
                      />
                      {i < (alerta.oleadasLog || []).length - 1 && (
                        <div className="w-px h-6 bg-border" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 -mt-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          Oleada {log.oleadaNumero} — {log.tipo}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {log.guardiasNotificados} guardias
                        </span>
                      </div>
                      {log.radioMaxKm > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {log.radioMinKm}–{log.radioMaxKm} km
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {(!alerta.oleadasLog || alerta.oleadasLog.length === 0) && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Sin oleadas registradas
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detalle Notificados */}
      {alerta.notificaciones && alerta.notificaciones.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Detalle de Notificaciones ({alerta.notificaciones.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guardia</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Oleada</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerta.notificaciones.map((n) => {
                  const nombre = n.guardia
                    ? `${n.guardia.persona.firstName} ${n.guardia.persona.lastName}`
                    : n.guardiaId.slice(0, 8);
                  const phone = n.guardia?.persona?.phoneMobile || n.guardia?.persona?.phone;
                  const esContratado = n.guardia?.lifecycleStatus === "contratado";
                  const esPoolTE = n.guardia?.lifecycleStatus === "te";
                  const tipoLabel = esContratado ? "Contratado" : esPoolTE ? "Turno Extra" : "—";
                  const tipoClass = esContratado
                    ? "bg-status-info-soft text-status-info-fg border-status-info-border"
                    : esPoolTE
                    ? "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30"
                    : "bg-muted/30 text-muted-foreground";
                  const CanalIcon = n.canal === "WHATSAPP" ? MessageCircle : n.canal === "EMAIL" ? Mail : Bell;
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="text-xs">
                        <div>{nombre}</div>
                        {phone && (
                          <span className="text-[10px] text-muted-foreground">{phone}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${tipoClass}`}>
                          {tipoLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <CanalIcon className="h-3 w-3" />
                          {n.canal}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{n.oleadaNumero}</TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(n.enviadaAt), "HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        {n.entregada ? (
                          <Badge variant="outline" className="bg-status-ok-soft text-status-ok-fg text-[10px]">
                            Entregada
                          </Badge>
                        ) : n.errorDetalle ? (
                          <Badge variant="outline" className="bg-status-danger-soft text-status-danger-fg text-[10px]">
                            Fallida
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-status-warn-soft text-status-warn-fg text-[10px]">
                            Pendiente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                        {n.errorDetalle || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {(alerta.estado === "ACTIVA" || alerta.estado === "EXPIRADA" || alerta.estado === "NO_CUBIERTA") && (
        <Card>
          <CardContent className="p-4 flex gap-3">
            {alerta.estado === "ACTIVA" && (
              <Button variant="outline" size="sm" className="text-status-danger-fg" onClick={handleCancelar}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Cancelar Alerta
              </Button>
            )}
            {(alerta.estado === "EXPIRADA" || alerta.estado === "NO_CUBIERTA") && (
              <Button variant="outline" size="sm" onClick={handleReAlertar}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Re-Alertar
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Intentos de Aceptación */}
      {alerta.aceptaciones && alerta.aceptaciones.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Intentos de Aceptación</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guardia</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Oleada</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerta.aceptaciones.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">
                      {a.guardia.persona.firstName} {a.guardia.persona.lastName}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(a.intentoAt), "HH:mm:ss")}
                    </TableCell>
                    <TableCell className="text-xs">{a.oleadaNumero}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          (a as any).exito === true || a.resultado === "ACEPTADA"
                            ? "bg-status-ok-soft text-status-ok-fg"
                            : "bg-status-danger-soft text-status-danger-fg"
                        }
                      >
                        {(a as any).exito === true || a.resultado === "ACEPTADA" ? "✅ Aceptado" : "❌ No alcanzó"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
