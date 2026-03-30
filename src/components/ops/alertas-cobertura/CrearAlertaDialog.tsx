"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Users,
  Clock,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import type { OleadaPreview, PreviewOleadasResponse } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface Installation {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

interface Puesto {
  id: string;
  name: string;
  teMontoClp: number | null;
}

export function CrearAlertaDialog({ open, onOpenChange, onCreated }: Props) {
  // Form state
  const [installationId, setInstallationId] = useState("");
  const [puestoId, setPuestoId] = useState("");
  const [modalidad, setModalidad] = useState("GGSS");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [montoOfrecido, setMontoOfrecido] = useState(0);
  const [funciones, setFunciones] = useState("");
  const [urgencia, setUrgencia] = useState<string>("NORMAL");
  const [radioKm, setRadioKm] = useState(30);
  const [requiereOS10, setRequiereOS10] = useState(true);
  const [soloConMovilizacion, setSoloConMovilizacion] = useState(false);
  const [soloDealer, setSoloDealer] = useState(false);
  const [genero, setGenero] = useState<string>("");
  const [notasInternas, setNotasInternas] = useState("");

  // Data
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [preview, setPreview] = useState<PreviewOleadasResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load installations
  useEffect(() => {
    if (!open) return;
    fetch("/api/ops/instalaciones?status=active&limit=500")
      .then((r) => r.json())
      .then((json) => {
        if (json.success || json.data) {
          // Filter to only installations with coordinates
          const all = (json.data || json).filter(
            (i: Installation) => i.lat != null && i.lng != null
          );
          setInstallations(all);
        }
      })
      .catch(() => toast.error("Error cargando instalaciones"));
  }, [open]);

  // Load puestos when installation changes
  useEffect(() => {
    if (!installationId) {
      setPuestos([]);
      setPuestoId("");
      return;
    }
    fetch(`/api/crm/installations/${installationId}/asignaciones`)
      .then((r) => r.json())
      .then((json) => {
        // Extract unique puestos from response
        const data = json.data || json;
        if (Array.isArray(data)) {
          const puestosMap = new Map<string, Puesto>();
          for (const item of data) {
            const p = item.puesto || item;
            if (p.id && !puestosMap.has(p.id)) {
              puestosMap.set(p.id, { id: p.id, name: p.name, teMontoClp: p.teMontoClp ?? null });
            }
          }
          setPuestos(Array.from(puestosMap.values()));
        }
      })
      .catch(() => {});
  }, [installationId]);

  // Auto-set monto when puesto changes
  useEffect(() => {
    if (puestoId) {
      const puesto = puestos.find((p) => p.id === puestoId);
      if (puesto?.teMontoClp) setMontoOfrecido(puesto.teMontoClp);
    }
  }, [puestoId, puestos]);

  // Preview oleadas with debounce
  const fetchPreview = useCallback(async () => {
    if (!installationId || !fechaInicio || !fechaFin || !funciones) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/ops/alertas-cobertura/preview-oleadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          puestoId: puestoId || undefined,
          modalidad,
          fechaInicio,
          fechaFin,
          montoOfrecido,
          funciones,
          urgencia: urgencia || undefined,
          radioKm,
          requiereOS10,
          soloConMovilizacion,
          soloDealer,
          genero: genero || undefined,
        }),
      });
      const json = await res.json();
      if (json.success !== false) {
        setPreview(json as PreviewOleadasResponse);
      } else {
        setPreview(null);
      }
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [installationId, puestoId, modalidad, fechaInicio, fechaFin, montoOfrecido, funciones, urgencia, radioKm, requiereOS10, soloConMovilizacion, soloDealer, genero]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchPreview, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchPreview]);

  const handleCreate = async () => {
    if (!installationId || !fechaInicio || !fechaFin || !funciones) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/ops/alertas-cobertura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          puestoId: puestoId || undefined,
          modalidad,
          fechaInicio,
          fechaFin,
          montoOfrecido,
          funciones,
          urgencia: urgencia || undefined,
          radioKm,
          requiereOS10,
          soloConMovilizacion,
          soloDealer,
          genero: genero || undefined,
          notasInternas: notasInternas || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Alerta de cobertura creada");
        onOpenChange(false);
        resetForm();
        onCreated();
      } else {
        toast.error(json.error || "Error al crear alerta");
      }
    } catch {
      toast.error("Error al crear alerta");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setInstallationId("");
    setPuestoId("");
    setModalidad("GGSS");
    setFechaInicio("");
    setFechaFin("");
    setMontoOfrecido(0);
    setFunciones("");
    setUrgencia("NORMAL");
    setRadioKm(30);
    setRequiereOS10(true);
    setSoloConMovilizacion(false);
    setSoloDealer(false);
    setGenero("");
    setNotasInternas("");
    setPreview(null);
  };

  const OLEADA_TIPO_LABELS: Record<string, string> = {
    TURNO_SALIENTE: "Turno Saliente",
    CERCANO: "Cercanos",
    MEDIANO: "Medianos",
    LEJANO: "Lejanos",
    EXTERNO: "Externos",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Alerta de Cobertura</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Form */}
          <div className="space-y-4">
            {/* Instalación */}
            <div className="space-y-1.5">
              <Label>Instalación *</Label>
              <Select value={installationId} onValueChange={setInstallationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar instalación" />
                </SelectTrigger>
                <SelectContent>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {i.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Puesto */}
            {puestos.length > 0 && (
              <div className="space-y-1.5">
                <Label>Puesto</Label>
                <Select value={puestoId} onValueChange={setPuestoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los puestos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los puestos</SelectItem>
                    {puestos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Modalidad */}
            <div className="space-y-1.5">
              <Label>Modalidad *</Label>
              <Select value={modalidad} onValueChange={setModalidad}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GGSS">GGSS — Guardia de Seguridad</SelectItem>
                  <SelectItem value="CCTV">CCTV — Monitoreo Cámaras</SelectItem>
                  <SelectItem value="CONTROL_ACCESO">Control de Acceso</SelectItem>
                  <SelectItem value="RONDAS">Rondas</SelectItem>
                  <SelectItem value="MIXTO">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-px bg-border" />

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha/hora inicio *</Label>
                <Input
                  type="datetime-local"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha/hora fin *</Label>
                <Input
                  type="datetime-local"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                />
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Monto */}
            <div className="space-y-1.5">
              <Label>Monto ofrecido (CLP)</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={montoOfrecido}
                onChange={(e) => setMontoOfrecido(Number(e.target.value))}
                placeholder="0 = usar monto de instalación"
              />
              <p className="text-[10px] text-muted-foreground">
                0 = usar monto configurado en la instalación/puesto
              </p>
            </div>

            {/* Funciones */}
            <div className="space-y-1.5">
              <Label>Funciones / descripción *</Label>
              <Textarea
                value={funciones}
                onChange={(e) => setFunciones(e.target.value)}
                placeholder="Control de acceso, rondas perimetrales, supervisión CCTV..."
                rows={2}
              />
            </div>

            {/* Urgencia */}
            <div className="space-y-1.5">
              <Label>Urgencia</Label>
              <Select value={urgencia} onValueChange={setUrgencia}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="URGENTE">🚨 Urgente</SelectItem>
                  <SelectItem value="HOY">⚠️ Hoy</SelectItem>
                  <SelectItem value="NORMAL">📋 Normal</SelectItem>
                  <SelectItem value="PROGRAMADA">📅 Programada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-px bg-border" />

            {/* Filtros */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtros de guardia</p>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Solo con OS-10</Label>
                <Switch checked={requiereOS10} onCheckedChange={setRequiereOS10} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Solo con movilización</Label>
                <Switch checked={soloConMovilizacion} onCheckedChange={setSoloConMovilizacion} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Solo dealer</Label>
                <Switch checked={soloDealer} onCheckedChange={setSoloDealer} />
              </div>

              <div className="space-y-1.5">
                <Label>Género</Label>
                <Select value={genero} onValueChange={setGenero}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin restricción" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin restricción</SelectItem>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Femenino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Radio máximo</Label>
                  <span className="text-xs text-muted-foreground font-mono">{radioKm} km</span>
                </div>
                <Slider
                  value={[radioKm]}
                  onValueChange={([v]: number[]) => setRadioKm(v)}
                  min={5}
                  max={100}
                  step={5}
                />
              </div>
            </div>

            {/* Notas internas */}
            <div className="space-y-1.5">
              <Label>Notas internas</Label>
              <Textarea
                value={notasInternas}
                onChange={(e) => setNotasInternas(e.target.value)}
                placeholder="Notas visibles solo para supervisores..."
                rows={2}
              />
            </div>
          </div>

          {/* Right: Preview */}
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-teal-400" />
                Preview de Oleadas
              </h3>

              {loadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !preview ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Info className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Completa los campos para ver el preview de oleadas
                  </p>
                </div>
              ) : (
                <>
                  {preview.oleadas.map((oleada) => (
                    <div
                      key={oleada.numero}
                      className="flex items-start gap-3 text-sm"
                    >
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">
                        {oleada.numero}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-xs">
                            {OLEADA_TIPO_LABELS[oleada.tipo] || oleada.tipo}
                          </span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {oleada.guardiaCount} guardias
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {oleada.radioKm} · Espera {oleada.esperaMin} min
                        </p>
                      </div>
                    </div>
                  ))}

                  <div className="h-px bg-border" />

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-semibold">{preview.totalGuardias}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Estimado:</span>
                      <span className="font-semibold">{preview.tiempoEstimadoMin} min</span>
                    </div>
                  </div>

                  {preview.cobertura.sinCoordenadas > 0 && (
                    <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] text-amber-400">
                        {preview.cobertura.sinCoordenadas} guardia(s) sin coordenadas — no evaluable(s) por distancia
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating || !installationId || !fechaInicio || !fechaFin || !funciones}>
            {creating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Crear Alerta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
