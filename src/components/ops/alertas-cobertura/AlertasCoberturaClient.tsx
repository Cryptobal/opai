"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Plus,
  Clock,
  CheckCircle2,
  History,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  Loader2,
  XCircle,
  RefreshCw,
  Siren,
  Shield,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CountdownTimer } from "./CountdownTimer";
import { CrearAlertaDialog } from "./CrearAlertaDialog";
import { IndiceGeografico } from "./IndiceGeografico";
import type { AlertaCobertura, AlertaEstado } from "./types";
import { ESTADO_BADGE, URGENCIA_BADGE, formatClp } from "./types";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  userRole: string;
  tenantId: string;
}

export function AlertasCoberturaClient({ userRole, tenantId }: Props) {
  const router = useRouter();
  const [alertas, setAlertas] = useState<AlertaCobertura[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("activas");
  const [crearOpen, setCrearOpen] = useState(false);

  // Historial filters
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [historialPage, setHistorialPage] = useState(1);
  const [historialTotal, setHistorialTotal] = useState(0);

  const fetchAlertas = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (tab === "activas") {
        params.set("estado", "ACTIVA");
      } else if (tab === "aceptadas") {
        params.set("estado", "ACEPTADA,PENDIENTE_CONFIRMACION");
      } else if (tab === "historial") {
        if (filtroEstado !== "todos") params.set("estado", filtroEstado);
        if (filtroFechaDesde) params.set("fechaDesde", filtroFechaDesde);
        if (filtroFechaHasta) params.set("fechaHasta", filtroFechaHasta);
        params.set("page", String(historialPage));
        params.set("limit", "20");
      }

      const res = await fetch(`/api/ops/alertas-cobertura?${params}`);
      const json = await res.json();
      if (json.success) {
        setAlertas(json.data);
        if (json.pagination) setHistorialTotal(json.pagination.total);
      }
    } catch (err) {
      console.error("[AlertasCobertura] Error fetching:", err);
      toast.error("Error al cargar alertas");
    } finally {
      setLoading(false);
    }
  }, [tab, filtroEstado, filtroFechaDesde, filtroFechaHasta, historialPage]);

  useEffect(() => {
    if (tab !== "geografico") fetchAlertas();
  }, [fetchAlertas, tab]);

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

      channel.bind("alerta-creada", () => fetchAlertas());
      channel.bind("oleada-activada", () => fetchAlertas());
      channel.bind("alerta-aceptada", () => fetchAlertas());
      channel.bind("alerta-pendiente-confirmacion", () => fetchAlertas());
    });

    return () => {
      if (channel) {
        channel.unbind_all();
        channel.unsubscribe();
      }
      if (pusherInstance) pusherInstance.disconnect();
    };
  }, [tenantId, fetchAlertas]);

  const activas = alertas.filter((a) => a.estado === "ACTIVA");
  const aceptadas = alertas.filter((a) => a.estado === "ACEPTADA" || a.estado === "PENDIENTE_CONFIRMACION");

  const handleCancelar = async (alertaId: string) => {
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
        fetchAlertas();
      } else {
        toast.error(json.error || "Error al cancelar");
      }
    } catch {
      toast.error("Error al cancelar alerta");
    }
  };

  const handleConfirmar = async (alertaId: string, sePresentó: boolean) => {
    try {
      if (sePresentó) {
        const res = await fetch(`/api/ops/alertas-cobertura/${alertaId}?action=confirmar`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asignacionPauta: true }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success("Guardia confirmado — alerta completada");
          fetchAlertas();
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
          fetchAlertas();
        } else {
          toast.error(json.error || "Error al re-alertar");
        }
      }
    } catch {
      toast.error("Error al procesar confirmación");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="activas" className="gap-1.5">
                <Siren className="h-3.5 w-3.5" />
                Activas
                {activas.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {activas.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="aceptadas" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aceptadas
                {aceptadas.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {aceptadas.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="historial" className="gap-1.5">
                <History className="h-3.5 w-3.5" />
                Historial
              </TabsTrigger>
              <TabsTrigger value="geografico" className="gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Geografico
              </TabsTrigger>
            </TabsList>

            <Button onClick={() => setCrearOpen(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nueva Alerta
            </Button>
          </div>

          {/* Tab Activas */}
          <TabsContent value="activas" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activas.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Shield className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No hay alertas activas en este momento
                  </p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setCrearOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Crear Alerta
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activas.map((alerta) => (
                  <AlertaActivaCard
                    key={alerta.id}
                    alerta={alerta}
                    onCancel={() => handleCancelar(alerta.id)}
                    onViewDetail={() => router.push(`/ops/alertas-cobertura/${alerta.id}`)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab Aceptadas */}
          <TabsContent value="aceptadas" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : aceptadas.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No hay alertas esperando confirmacion
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {aceptadas.map((alerta) => (
                  <AlertaAceptadaCard
                    key={alerta.id}
                    alerta={alerta}
                    onConfirmar={(si) => handleConfirmar(alerta.id, si)}
                    onViewDetail={() => router.push(`/ops/alertas-cobertura/${alerta.id}`)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab Historial */}
          <TabsContent value="historial" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="ACTIVA">Activa</SelectItem>
                  <SelectItem value="ACEPTADA">Aceptada</SelectItem>
                  <SelectItem value="CONFIRMADA">Confirmada</SelectItem>
                  <SelectItem value="CANCELADA">Cancelada</SelectItem>
                  <SelectItem value="EXPIRADA">Expirada</SelectItem>
                  <SelectItem value="NO_CUBIERTA">No Cubierta</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={filtroFechaDesde}
                onChange={(e) => setFiltroFechaDesde(e.target.value)}
                className="w-[160px]"
                placeholder="Desde"
              />
              <Input
                type="date"
                value={filtroFechaHasta}
                onChange={(e) => setFiltroFechaHasta(e.target.value)}
                className="w-[160px]"
                placeholder="Hasta"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Instalacion</TableHead>
                        <TableHead>Modalidad</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Guardia</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-center">Oleadas</TableHead>
                        <TableHead>Creada por</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alertas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Sin resultados
                          </TableCell>
                        </TableRow>
                      ) : (
                        alertas.map((a) => {
                          const estadoBadge = ESTADO_BADGE[a.estado] ?? { label: a.estado, className: "bg-gray-500/20 text-gray-400" };
                          return (
                            <TableRow
                              key={a.id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => router.push(`/ops/alertas-cobertura/${a.id}`)}
                            >
                              <TableCell className="text-xs">
                                {format(new Date(a.createdAt), "dd MMM yyyy HH:mm", { locale: es })}
                              </TableCell>
                              <TableCell className="font-medium text-sm">
                                {a.installation.name}
                              </TableCell>
                              <TableCell className="text-xs">{a.modalidad}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={estadoBadge.className}>
                                  {estadoBadge.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {a.aceptadaPorGuardia
                                  ? `${a.aceptadaPorGuardia.persona.firstName} ${a.aceptadaPorGuardia.persona.lastName}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono">
                                {formatClp(a.montoOfrecido)}
                              </TableCell>
                              <TableCell className="text-center text-xs">
                                {a.oleadaActual + 1}/{(a.oleadasConfig?.length || 0)}
                              </TableCell>
                              <TableCell className="text-xs">{a.creadaPor.name}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {historialTotal > 20 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {historialTotal} alertas totales
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={historialPage <= 1}
                        onClick={() => setHistorialPage((p) => p - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={historialPage * 20 >= historialTotal}
                        onClick={() => setHistorialPage((p) => p + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Tab Geografico */}
          <TabsContent value="geografico" className="mt-4">
            <IndiceGeografico />
          </TabsContent>
        </Tabs>
      </div>

      <CrearAlertaDialog open={crearOpen} onOpenChange={setCrearOpen} onCreated={fetchAlertas} />
    </div>
  );
}

/* ── Sub-components ── */

function AlertaActivaCard({
  alerta,
  onCancel,
  onViewDetail,
}: {
  alerta: AlertaCobertura;
  onCancel: () => void;
  onViewDetail: () => void;
}) {
  const urgenciaBadge = alerta.urgencia
    ? URGENCIA_BADGE[alerta.urgencia] ?? { label: alerta.urgencia, className: "bg-gray-500/20 text-gray-400" }
    : null;

  const totalOleadas = alerta.oleadasConfig?.length || 0;

  return (
    <Card className={alerta.urgencia === "URGENTE" ? "border-red-500/40" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            {urgenciaBadge && (
              <Badge variant="outline" className={urgenciaBadge.className}>
                {urgenciaBadge.label}
              </Badge>
            )}
            <CardTitle className="text-base">{alerta.installation.name}</CardTitle>
          </div>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
            {alerta.modalidad}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Monto</span>
          <span className="font-mono font-semibold text-emerald-400">
            {formatClp(alerta.montoOfrecido)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Oleada</span>
          <div className="flex items-center gap-2">
            <span className="text-xs">
              {alerta.oleadaActual + 1} de {totalOleadas}
            </span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${totalOleadas > 0 ? ((alerta.oleadaActual + 1) / totalOleadas) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {alerta.proximaOleadaAt && (
          <CountdownTimer
            targetDate={alerta.proximaOleadaAt}
            showLabel
            size="sm"
          />
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {alerta._count?.notificaciones ?? 0} notificados
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={onViewDetail}>
            Ver Detalle
          </Button>
          <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300" onClick={onCancel}>
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertaAceptadaCard({
  alerta,
  onConfirmar,
  onViewDetail,
}: {
  alerta: AlertaCobertura;
  onConfirmar: (sePresentó: boolean) => void;
  onViewDetail: () => void;
}) {
  const guardia = alerta.aceptadaPorGuardia;
  const nombreGuardia = guardia
    ? `${guardia.persona.firstName} ${guardia.persona.lastName}`
    : "Guardia desconocido";
  const phone = guardia?.persona?.phone;

  return (
    <Card className="border-emerald-500/40">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              Aceptada
            </Badge>
            <CardTitle className="text-base">{alerta.installation.name}</CardTitle>
          </div>
          {alerta.esInternoAceptacion === false && (
            <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
              Externo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
          <p className="text-sm font-medium">{nombreGuardia}</p>
          {phone && (
            <div className="flex items-center gap-3">
              <a href={`tel:${phone}`} className="text-xs text-teal-400 hover:underline flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {phone}
              </a>
              <a
                href={`https://wa.me/56${phone.replace(/\D/g, "").replace(/^56/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                WhatsApp
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Monto</span>
          <span className="font-mono font-semibold text-emerald-400">
            {formatClp(alerta.montoOfrecido)}
          </span>
        </div>

        {alerta.confirmadaAt == null && alerta.proximaOleadaAt && (
          <CountdownTimer
            targetDate={alerta.proximaOleadaAt}
            showLabel
            label="Auto-confirma en"
            size="sm"
          />
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="default"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => onConfirmar(true)}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Si se presento
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-400 hover:text-red-300"
            onClick={() => onConfirmar(false)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Re-Alertar
          </Button>
        </div>

        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onViewDetail}>
          Ver detalle completo
        </Button>
      </CardContent>
    </Card>
  );
}
