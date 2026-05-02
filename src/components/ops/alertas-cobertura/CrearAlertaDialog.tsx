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
  DialogDescription,
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
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import type { OleadaPreview, PreviewOleadasResponse } from "./types";

type ModoAlerta = "instalacion" | "libre";
type AudienciaAlerta = "internos" | "externos" | "ambos";

/** Time picker compacto con selects de hora y minuto (15 min steps). */
function QuickTimePicker({
  value,
  onChange,
  label,
}: {
  value: string; // "HH:mm"
  onChange: (v: string) => void;
  label: string;
}) {
  const [h, m] = value.split(":");
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minutes = ["00", "15", "30", "45"];
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-1.5">
        <Select value={h ?? "09"} onValueChange={(nv) => onChange(`${nv}:${m ?? "00"}`)}>
          <SelectTrigger className="h-10 w-[72px] font-mono"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-60">
            {hours.map((hh) => <SelectItem key={hh} value={hh}>{hh}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="self-center font-mono text-muted-foreground">:</span>
        <Select value={m ?? "00"} onValueChange={(nv) => onChange(`${h ?? "09"}:${nv}`)}>
          <SelectTrigger className="h-10 w-[72px] font-mono"><SelectValue /></SelectTrigger>
          <SelectContent>
            {minutes.map((mm) => <SelectItem key={mm} value={mm}>{mm}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

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
  shiftStart: string | null;
  shiftEnd: string | null;
  teMontoClp: number | null;
}

export function CrearAlertaDialog({ open, onOpenChange, onCreated }: Props) {
  // Modo de alerta
  const [modo, setModo] = useState<ModoAlerta>("instalacion");

  // Form state — modo instalación
  const [installationId, setInstallationId] = useState("");
  const [puestoId, setPuestoId] = useState("");

  // Audiencia: a quién notificar (internos = contratados, externos = con turnos extra)
  const [audiencia, setAudiencia] = useState<AudienciaAlerta>("ambos");

  // Override de oleadas por alerta (si null, usa config del tenant)
  const [oleadasCustom, setOleadasCustom] = useState(false);
  const [o1Radio, setO1Radio] = useState(5);
  const [o1Espera, setO1Espera] = useState(10);
  const [o2Enabled, setO2Enabled] = useState(true);
  const [o2Radio, setO2Radio] = useState(10);
  const [o2Espera, setO2Espera] = useState(15);
  const [o3Enabled, setO3Enabled] = useState(true);
  const [o3Radio, setO3Radio] = useState(20);
  const [o3Espera, setO3Espera] = useState(20);
  const [oExtEnabled, setOExtEnabled] = useState(true);
  const [oExtEspera, setOExtEspera] = useState(30);

  // Cargar defaults del tenant al abrir el modal
  useEffect(() => {
    if (!open) return;
    fetch("/api/ops/alertas-cobertura/config")
      .then((r) => r.json())
      .then((j) => {
        const c = j?.config || j;
        if (c?.oleada1RadioKm != null) setO1Radio(c.oleada1RadioKm);
        if (c?.oleada1EsperaMin != null) setO1Espera(c.oleada1EsperaMin);
        if (c?.oleada2RadioKm != null) setO2Radio(c.oleada2RadioKm);
        if (c?.oleada2EsperaMin != null) setO2Espera(c.oleada2EsperaMin);
        if (c?.oleada3RadioKm != null) setO3Radio(c.oleada3RadioKm);
        if (c?.oleada3EsperaMin != null) setO3Espera(c.oleada3EsperaMin);
        if (c?.oleadaExternaEsperaMin != null) setOExtEspera(c.oleadaExternaEsperaMin);
      })
      .catch(() => {});
  }, [open]);

  // Form state — modo libre
  const [libreAddress, setLibreAddress] = useState("");
  const [libreLat, setLibreLat] = useState<number | null>(null);
  const [libreLng, setLibreLng] = useState<number | null>(null);
  const [libreComuna, setLibreComuna] = useState("");
  const [libreCiudad, setLibreCiudad] = useState("");
  const [libreHoraInicio, setLibreHoraInicio] = useState("09:00");
  const [libreHoraFin, setLibreHoraFin] = useState("18:00");

  const [modalidad, setModalidad] = useState("GGSS");
  const [fechaTurno, setFechaTurno] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  // Monto como string para permitir borrar el campo por completo (el Number(input)
  // del value lo trataba como 0 y no dejaba editar). Se convierte a number al enviar.
  const [montoInput, setMontoInput] = useState("0");
  const montoOfrecido = montoInput === "" ? 0 : Number(montoInput);
  const [funciones, setFunciones] = useState("");
  const [urgencia, setUrgencia] = useState<string>("");
  const [radioKm, setRadioKm] = useState(30);
  const [requiereOS10, setRequiereOS10] = useState(false);
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
              puestosMap.set(p.id, {
                id: p.id,
                name: p.name,
                shiftStart: p.shiftStart ?? null,
                shiftEnd: p.shiftEnd ?? null,
                teMontoClp: p.teMontoClp ?? null,
              });
            }
          }
          setPuestos(Array.from(puestosMap.values()));
        }
      })
      .catch(() => {});
  }, [installationId]);

  // Modo libre: auto-calcular fechaInicio/fechaFin desde fechaTurno + horarios manuales
  useEffect(() => {
    if (modo !== "libre" || !fechaTurno || !libreHoraInicio || !libreHoraFin) return;
    setFechaInicio(`${fechaTurno}T${libreHoraInicio}`);
    if (libreHoraFin < libreHoraInicio) {
      // Turno nocturno: cruza medianoche
      const d = new Date(fechaTurno);
      d.setDate(d.getDate() + 1);
      setFechaFin(`${d.toISOString().slice(0, 10)}T${libreHoraFin}`);
    } else {
      setFechaFin(`${fechaTurno}T${libreHoraFin}`);
    }
  }, [modo, fechaTurno, libreHoraInicio, libreHoraFin]);

  // Auto-set monto and compute dates when puesto or fechaTurno changes
  useEffect(() => {
    if (puestoId) {
      const puesto = puestos.find((p) => p.id === puestoId);
      if (puesto?.teMontoClp) setMontoInput(String(puesto.teMontoClp));

      // Auto-compute fechaInicio/fechaFin from puesto shift times + selected date
      if (fechaTurno && puesto?.shiftStart && puesto?.shiftEnd) {
        setFechaInicio(`${fechaTurno}T${puesto.shiftStart}`);
        // If shiftEnd < shiftStart, it's a night shift (ends next day)
        if (puesto.shiftEnd < puesto.shiftStart) {
          const d = new Date(fechaTurno);
          d.setDate(d.getDate() + 1);
          setFechaFin(`${d.toISOString().slice(0, 10)}T${puesto.shiftEnd}`);
        } else {
          setFechaFin(`${fechaTurno}T${puesto.shiftEnd}`);
        }
      }
    }
  }, [puestoId, puestos, fechaTurno]);

  // Preview oleadas with debounce
  const fetchPreview = useCallback(async () => {
    const ubicacionListaInstalacion = modo === "instalacion" && !!installationId;
    const ubicacionListaLibre =
      modo === "libre" && libreLat != null && libreLng != null && !!libreAddress;
    if ((!ubicacionListaInstalacion && !ubicacionListaLibre) || !fechaInicio || !fechaFin || !funciones) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const body: Record<string, unknown> = {
        modalidad,
        fechaInicio: new Date(fechaInicio).toISOString(),
        fechaFin: new Date(fechaFin).toISOString(),
        montoOfrecido,
        funciones,
        urgencia: urgencia && urgencia !== "__none__" ? urgencia : undefined,
        radioKm,
        requiereOS10,
        soloConMovilizacion,
        soloDealer,
        genero: genero || undefined,
        audiencia,
        oleadasOverride: oleadasCustom
          ? {
              oleada1RadioKm: o1Radio,
              oleada1EsperaMin: o1Espera,
              oleada2Enabled: o2Enabled,
              oleada2RadioKm: o2Radio,
              oleada2EsperaMin: o2Espera,
              oleada3Enabled: o3Enabled,
              oleada3RadioKm: o3Radio,
              oleada3EsperaMin: o3Espera,
              oleadaExternaEnabled: oExtEnabled,
              oleadaExternaEsperaMin: oExtEspera,
            }
          : null,
      };
      if (modo === "instalacion") {
        body.installationId = installationId;
        body.puestoId = puestoId || undefined;
      } else {
        body.libreAddress = libreAddress;
        body.libreLat = libreLat;
        body.libreLng = libreLng;
        body.libreComuna = libreComuna || undefined;
        body.libreCiudad = libreCiudad || undefined;
      }

      const res = await fetch("/api/ops/alertas-cobertura/preview-oleadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
  }, [modo, installationId, puestoId, libreAddress, libreLat, libreLng, libreComuna, libreCiudad, modalidad, fechaInicio, fechaFin, montoOfrecido, funciones, urgencia, radioKm, requiereOS10, soloConMovilizacion, soloDealer, genero, audiencia, oleadasCustom, o1Radio, o1Espera, o2Enabled, o2Radio, o2Espera, o3Enabled, o3Radio, o3Espera, oExtEnabled, oExtEspera]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchPreview, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchPreview]);

  const handleCreate = async () => {
    const ubicacionListaInstalacion = modo === "instalacion" && !!installationId;
    const ubicacionListaLibre =
      modo === "libre" && libreLat != null && libreLng != null && !!libreAddress;
    if ((!ubicacionListaInstalacion && !ubicacionListaLibre) || !fechaInicio || !fechaFin || !funciones) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    if (modo === "libre" && (!montoOfrecido || montoOfrecido <= 0)) {
      toast.error("En modo libre el monto ofrecido debe ser mayor a 0");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        modalidad,
        fechaInicio: new Date(fechaInicio).toISOString(),
        fechaFin: new Date(fechaFin).toISOString(),
        montoOfrecido,
        funciones,
        urgencia: urgencia && urgencia !== "__none__" ? urgencia : undefined,
        radioKm,
        requiereOS10,
        soloConMovilizacion,
        soloDealer,
        genero: genero && genero !== "__none__" ? genero : undefined,
        notasInternas: notasInternas || undefined,
      };
      if (modo === "instalacion") {
        body.installationId = installationId;
        body.puestoId = puestoId || undefined;
      } else {
        body.libreAddress = libreAddress;
        body.libreLat = libreLat;
        body.libreLng = libreLng;
        body.libreComuna = libreComuna || undefined;
        body.libreCiudad = libreCiudad || undefined;
      }

      const res = await fetch("/api/ops/alertas-cobertura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    setModo("instalacion");
    setAudiencia("ambos");
    setInstallationId("");
    setPuestoId("");
    setLibreAddress("");
    setLibreLat(null);
    setLibreLng(null);
    setLibreComuna("");
    setLibreCiudad("");
    setLibreHoraInicio("09:00");
    setLibreHoraFin("18:00");
    setModalidad("GGSS");
    setFechaTurno("");
    setFechaInicio("");
    setFechaFin("");
    setMontoInput("0");
    setFunciones("");
    setUrgencia("");
    setRadioKm(30);
    setRequiereOS10(false);
    setSoloConMovilizacion(false);
    setSoloDealer(false);
    setGenero("");
    setNotasInternas("");
    setOleadasCustom(false);
    setO2Enabled(true);
    setO3Enabled(true);
    setOExtEnabled(true);
    setPreview(null);
  };

  const OLEADA_TIPO_LABELS: Record<string, string> = {
    TURNO_SALIENTE: "Turno Saliente",
    INTERNO_CERCANO: "Contratados (cercanos)",
    INTERNO_MEDIO: "Contratados (medianos)",
    INTERNO_LEJANO: "Contratados (lejanos)",
    CERCANO: "Contratados (cercanos)",
    MEDIANO: "Contratados (medianos)",
    LEJANO: "Contratados (lejanos)",
    EXTERNO: "Turnos Extra",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:!max-w-[1200px] !max-h-[94vh] overflow-y-auto p-6 sm:p-8"
        style={{ width: "min(1200px, calc(100vw - 2rem))" }}
      >
        <DialogHeader>
          <DialogTitle>Nueva Alerta de Cobertura</DialogTitle>
          <DialogDescription>
            Crea una alerta por instalación o por dirección libre. El preview de oleadas se actualiza en tiempo real.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-8">
          {/* Left: Form */}
          <div className="space-y-4">
            {/* Toggle modo */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted/40 border">
              <button
                type="button"
                onClick={() => setModo("instalacion")}
                className={`text-xs font-medium py-2 rounded-md transition-colors ${
                  modo === "instalacion"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Por Instalación
              </button>
              <button
                type="button"
                onClick={() => setModo("libre")}
                className={`text-xs font-medium py-2 rounded-md transition-colors ${
                  modo === "libre"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Dirección libre
              </button>
            </div>

            {/* Selector de audiencia: a quién notificar */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notificar a
              </Label>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted/40 border">
                {(["internos", "externos", "ambos"] as AudienciaAlerta[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAudiencia(a)}
                    className={`text-[11px] font-medium py-1.5 rounded-md transition-colors capitalize ${
                      audiencia === a
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a === "internos" ? "Contratados" : a === "externos" ? "Turnos Extra" : "Ambos"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {audiencia === "internos"
                  ? "Solo guardias contratados (planta) dentro del radio."
                  : audiencia === "externos"
                  ? "Solo guardias con disponibilidad para turnos extra."
                  : "Contratados y turnos extra."}
              </p>
            </div>

            {modo === "instalacion" ? (
              <>
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
                    <Select value={puestoId || "__all__"} onValueChange={(v) => setPuestoId(v === "__all__" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos los puestos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos los puestos</SelectItem>
                        {puestos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Modo libre — dirección con Google Places */}
                <div className="space-y-1.5">
                  <Label>Dirección *</Label>
                  <AddressAutocomplete
                    value={libreAddress}
                    placeholder="Busca la dirección del turno..."
                    onChange={(r: AddressResult) => {
                      setLibreAddress(r.address);
                      setLibreLat(r.lat);
                      setLibreLng(r.lng);
                      setLibreComuna(r.commune || "");
                      setLibreCiudad(r.city || "");
                    }}
                  />
                  {libreLat != null && libreLng != null && (
                    <p className="text-[10px] text-muted-foreground">
                      {libreComuna ? `${libreComuna} · ` : ""}
                      {libreLat.toFixed(5)}, {libreLng.toFixed(5)}
                    </p>
                  )}
                </div>

                {/* Horarios manuales con picker compacto */}
                <div className="grid grid-cols-2 gap-3">
                  <QuickTimePicker
                    label="Hora inicio *"
                    value={libreHoraInicio}
                    onChange={setLibreHoraInicio}
                  />
                  <QuickTimePicker
                    label="Hora fin *"
                    value={libreHoraFin}
                    onChange={setLibreHoraFin}
                  />
                </div>
              </>
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
                  <SelectItem value="TACTICO">Táctico</SelectItem>
                  <SelectItem value="MIXTO">Mixto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-px bg-border" />

            {/* Fecha del turno */}
            <div className="space-y-1.5">
              <Label>Dia del turno *</Label>
              <Input
                type="date"
                value={fechaTurno}
                onChange={(e) => setFechaTurno(e.target.value)}
              />
              {puestoId && fechaTurno && fechaInicio && fechaFin && (
                <p className="text-xs text-muted-foreground">
                  Horario: {fechaInicio.slice(11, 16)} — {fechaFin.slice(11, 16)}
                  {fechaFin.slice(0, 10) !== fechaTurno ? " (dia siguiente)" : ""}
                </p>
              )}
              {puestoId && fechaTurno && !fechaInicio && (
                <p className="text-xs text-status-warn-fg">
                  El puesto seleccionado no tiene horario configurado
                </p>
              )}
              {!puestoId && fechaTurno && (
                <p className="text-xs text-muted-foreground">
                  Selecciona un puesto para auto-completar el horario
                </p>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Monto */}
            <div className="space-y-1.5">
              <Label>Monto ofrecido (CLP)</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={montoInput}
                onChange={(e) => {
                  const v = e.target.value;
                  // Permitir vacío; si no, solo dígitos
                  if (v === "" || /^\d+$/.test(v)) setMontoInput(v);
                }}
                onBlur={() => {
                  if (montoInput === "") setMontoInput("0");
                }}
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
              <Select value={urgencia || "__none__"} onValueChange={(v) => setUrgencia(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin urgencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin urgencia</SelectItem>
                  <SelectItem value="URGENTE">🚨 Urgente</SelectItem>
                  <SelectItem value="HOY">⚠️ Hoy</SelectItem>
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
                <Select value={genero || "__none__"} onValueChange={(v) => setGenero(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin restricción" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin restricción</SelectItem>
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

            <div className="h-px bg-border" />

            {/* Personalizar oleadas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider">Oleadas</p>
                  <p className="text-[10px] text-muted-foreground">
                    {oleadasCustom
                      ? "Usando valores personalizados para esta alerta"
                      : "Usando valores del tenant (configuración general)"}
                  </p>
                </div>
                <Switch checked={oleadasCustom} onCheckedChange={setOleadasCustom} />
              </div>

              {oleadasCustom && (
                <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
                  {/* Oleada 1 — siempre activa */}
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-end">
                    <Badge variant="secondary" className="text-[10px] h-5 p-0 px-1.5 justify-center self-center">
                      1 · Cercanos
                    </Badge>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Radio (km)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={o1Radio}
                        onChange={(e) => setO1Radio(Number(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Espera (min)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={o1Espera}
                        onChange={(e) => setO1Espera(Number(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Oleada 2 — toggleable */}
                  <div className="space-y-2 border-t border-border/40 pt-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px] h-5 p-0 px-1.5">
                        2 · Medianos
                      </Badge>
                      <Switch checked={o2Enabled} onCheckedChange={setO2Enabled} />
                    </div>
                    {o2Enabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Radio (km)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={500}
                            value={o2Radio}
                            onChange={(e) => setO2Radio(Number(e.target.value) || 0)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Espera (min)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            value={o2Espera}
                            onChange={(e) => setO2Espera(Number(e.target.value) || 0)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Oleada 3 — toggleable */}
                  <div className="space-y-2 border-t border-border/40 pt-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px] h-5 p-0 px-1.5">
                        3 · Lejanos
                      </Badge>
                      <Switch checked={o3Enabled} onCheckedChange={setO3Enabled} />
                    </div>
                    {o3Enabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Radio (km)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={500}
                            value={o3Radio}
                            onChange={(e) => setO3Radio(Number(e.target.value) || 0)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Espera (min)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            value={o3Espera}
                            onChange={(e) => setO3Espera(Number(e.target.value) || 0)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Oleada externa (Turnos Extra) — toggleable */}
                  <div className="space-y-2 border-t border-border/40 pt-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px] h-5 p-0 px-1.5">
                        Ext · Turnos Extra
                      </Badge>
                      <Switch checked={oExtEnabled} onCheckedChange={setOExtEnabled} />
                    </div>
                    {oExtEnabled && (
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Espera (min)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={240}
                          value={oExtEspera}
                          onChange={(e) => setOExtEspera(Number(e.target.value) || 0)}
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                <Users className="h-4 w-4 text-status-info-fg" />
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
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-status-info-soft text-status-info-fg flex items-center justify-center text-xs font-bold">
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
                    <div className="flex items-start gap-2 rounded-md bg-status-warn-soft border border-status-warn-border p-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-status-warn-fg mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] text-status-warn-fg">
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
          <Button
            onClick={handleCreate}
            disabled={
              creating ||
              !fechaInicio ||
              !fechaFin ||
              !funciones ||
              (modo === "instalacion" && !installationId) ||
              (modo === "libre" && (!libreAddress || libreLat == null || libreLng == null || !montoOfrecido || montoOfrecido <= 0))
            }
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Crear Alerta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
