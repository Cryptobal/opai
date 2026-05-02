"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
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
import {
  ChevronRight,
  ShieldCheck,
  ShieldX,
  MapPin,
  User,
  ExternalLink,
  Globe,
  Pencil,
  Copy,
  RefreshCw,
  Pause,
  Play,
  XCircle,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";

const STAGE_TRANSITIONS: Record<string, string[]> = {
  POSTULADO: ["EN_REVISION", "DESCARTADO"],
  EN_REVISION: ["ENTREVISTA", "DESCARTADO"],
  ENTREVISTA: ["OFERTA", "DESCARTADO"],
  OFERTA: ["CONTRATADO", "DESCARTADO"],
  CONTRATADO: [],
  DESCARTADO: ["POSTULADO"],
};

interface Application {
  id: string;
  etapa: string;
  matchScore: number | null;
  matchDetalle: Record<string, number> | null;
  fuente: string;
  notasInternas: string | null;
  createdAt: string;
  guardia: {
    id: string;
    code: string | null;
    os10: boolean | null;
    os10ExpiresAt: string | null;
    experienciaAnios: number | null;
    turnosDisponibles: string[];
    lifecycleStatus: string;
    persona: {
      id: string;
      firstName: string;
      lastName: string;
      rut: string | null;
      sex: string | null;
      commune: string | null;
      region: string | null;
    };
  };
}

interface Job {
  id: string;
  titulo: string;
  descripcion: string;
  estado: string;
  turno: string;
  region: string;
  commune: string | null;
  installationId: string | null;
  jsonLdSlug: string | null;
  rentaMin: number | null;
  rentaMax: number | null;
  vacantes: number;
  requiereOS10: boolean;
  requiereMovilizacion: boolean;
  genero: string | null;
  experienciaMinAnios: number | null;
  funciones: string | null;
  expiraAt: string | null;
  updatedAt: string;
  applications: Application[];
  channels: Array<{ id: string; canal: string; estado: string | null; activo: boolean; externalId: string | null; errorDetalle: string | null }>;
  installation: { id: string; name: string } | null;
}

interface ManualChannel {
  key: string;
  label: string;
}

interface InstallationOption {
  id: string;
  name: string;
  commune: string | null;
}

const TURNOS_EDIT = [
  { value: "4x4_dia", label: "4×4 Día" },
  { value: "4x4_noche", label: "4×4 Noche" },
  { value: "5x2", label: "5×2" },
  { value: "6x1", label: "6×1" },
  { value: "otro", label: "Otro" },
];

const REGIONES_EDIT = [
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo",
  "Valparaíso", "Metropolitana", "O'Higgins", "Maule", "Ñuble", "Biobío",
  "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes",
];

const ETAPAS = ["POSTULADO", "EN_REVISION", "ENTREVISTA", "OFERTA", "CONTRATADO"] as const;
const ETAPA_LABELS: Record<string, string> = {
  POSTULADO: "Postulado",
  EN_REVISION: "En revisión",
  ENTREVISTA: "Entrevista",
  OFERTA: "Oferta",
  CONTRATADO: "Contratado",
  DESCARTADO: "Descartado",
};
const ETAPA_COLORS: Record<string, string> = {
  POSTULADO: "bg-muted/50",
  EN_REVISION: "bg-status-info-soft/40",
  ENTREVISTA: "bg-status-warn-soft/40",
  OFERTA: "bg-tint-violet/40",
  CONTRATADO: "bg-status-ok-soft/40",
};
const MANUAL_PORTALS: Record<string, string> = {
  indeed: "https://indeed.com/hiring",
  computrabajo: "https://www.computrabajo.cl",
  bumeran: "https://www.bumeran.com",
  laborum: "https://www.laborum.com",
  linkedin: "https://www.linkedin.com/talent",
  yapo: "https://www.yapo.cl",
};

const FUENTE_COLORS: Record<string, string> = {
  google_jobs: "bg-status-info-soft text-status-info-fg",
  indeed: "bg-tint-violet text-tint-violet-fg",
  computrabajo: "bg-status-warn-soft text-status-warn-fg",
  base_opai: "bg-status-ok-soft text-status-ok-fg",
  portal_guardia: "bg-tint-sky text-tint-sky-fg",
  directo: "bg-muted text-muted-foreground",
};

const NEXT_ETAPA: Record<string, string> = {
  POSTULADO: "EN_REVISION",
  EN_REVISION: "ENTREVISTA",
  ENTREVISTA: "OFERTA",
  OFERTA: "CONTRATADO",
};

function isHttpUrl(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^https?:\/\//i.test(s.trim());
}

function CardActions({
  app,
  jobId: _jobId,
  onMove,
}: {
  app: Application;
  jobId: string;
  onMove: (appId: string, etapa: string) => void;
}) {
  const personaId = app.guardia.persona.id;
  const transitions = STAGE_TRANSITIONS[app.etapa] ?? [];
  return (
    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      {personaId && (
        <Link
          href={`/personas/guardias/${personaId}`}
          title="Abrir ficha del guardia"
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      )}
      {transitions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Mover de etapa"
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel className="text-xs">Mover a</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {transitions.map((t) => (
              <DropdownMenuItem key={t} onClick={() => onMove(app.id, t)}>
                {ETAPA_LABELS[t] ?? t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function DraggableCard({
  app,
  children,
}: {
  app: Application;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: app.id,
    data: { etapa: app.etapa },
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

function DroppableColumn({
  etapa,
  className,
  children,
}: {
  etapa: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa, data: { etapa } });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-status-ok bg-status-ok-soft/60" : ""}`}
    >
      {children}
    </div>
  );
}

export function AtsPipelineClient({
  job,
  manualChannels = [],
  publicJobUrl,
  tenantSlug,
  installations = [],
}: {
  job: Job;
  manualChannels?: ManualChannel[];
  publicJobUrl: string | null;
  tenantSlug: string;
  installations?: InstallationOption[];
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [selected, setSelected] = useState<Application | null>(null);
  const [moving, setMoving] = useState(false);
  const [showDescartados, setShowDescartados] = useState(false);
  const [channelUrls, setChannelUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const ch of job.channels) {
      if (ch.externalId) initial[ch.canal] = ch.externalId;
    }
    return initial;
  });
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [jobAction, setJobAction] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    titulo: job.titulo,
    descripcion: job.descripcion,
    turno: job.turno,
    region: job.region,
    commune: job.commune ?? "",
    installationId: job.installationId ?? "",
    rentaMin: job.rentaMin != null ? String(job.rentaMin) : "",
    rentaMax: job.rentaMax != null ? String(job.rentaMax) : "",
    vacantes: String(job.vacantes ?? 1),
    requiereOS10: job.requiereOS10,
    requiereMovilizacion: job.requiereMovilizacion,
    genero: job.genero ?? "",
    experienciaMinAnios: String(job.experienciaMinAnios ?? 0),
    funciones: job.funciones ?? "",
  });

  useEffect(() => {
    setEditForm({
      titulo: job.titulo,
      descripcion: job.descripcion,
      turno: job.turno,
      region: job.region,
      commune: job.commune ?? "",
      installationId: job.installationId ?? "",
      rentaMin: job.rentaMin != null ? String(job.rentaMin) : "",
      rentaMax: job.rentaMax != null ? String(job.rentaMax) : "",
      vacantes: String(job.vacantes ?? 1),
      requiereOS10: job.requiereOS10,
      requiereMovilizacion: job.requiereMovilizacion,
      genero: job.genero ?? "",
      experienciaMinAnios: String(job.experienciaMinAnios ?? 0),
      funciones: job.funciones ?? "",
    });
  }, [job.id, job.updatedAt]);

  const siteOrigin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, []);
  const feedXmlUrl = tenantSlug
    ? `${siteOrigin}/api/public/${tenantSlug}/ats/feed.xml`
    : "";

  const pipeline = new Map<string, Application[]>();
  for (const e of ETAPAS) pipeline.set(e, []);
  pipeline.set("DESCARTADO", []);

  for (const app of job.applications) {
    const list = pipeline.get(app.etapa);
    if (list) list.push(app);
  }

  async function moveEtapa(appId: string, nuevaEtapa: string) {
    setMoving(true);
    try {
      const res = await fetch(`/api/ops/ats/jobs/${job.id}/applications/${appId}/etapa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: nuevaEtapa }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      toast.success(`Movido a ${ETAPA_LABELS[nuevaEtapa]}`);
      setSelected(null);
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setMoving(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const fromEtapa = active.data.current?.etapa as string | undefined;
    const toEtapa = (over.data.current?.etapa as string | undefined) ?? (over.id as string);
    if (!fromEtapa || !toEtapa || fromEtapa === toEtapa) return;
    const allowed = STAGE_TRANSITIONS[fromEtapa] ?? [];
    if (!allowed.includes(toEtapa)) {
      toast.error(
        `No se puede mover de ${ETAPA_LABELS[fromEtapa] ?? fromEtapa} a ${ETAPA_LABELS[toEtapa] ?? toEtapa}`,
      );
      return;
    }
    void moveEtapa(String(active.id), toEtapa);
  }

  async function saveChannelUrl(canal: string, url: string) {
    setSavingUrl(canal);
    try {
      const res = await fetch(`/api/ops/ats/jobs/${job.id}/channel-url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, externalUrl: url }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      toast.success(`URL de ${canal} guardada`);
    } catch {
      toast.error("Error de red");
    } finally {
      setSavingUrl(null);
    }
  }

  async function runJobAction(
    action: "pausar" | "cerrar" | "activar" | "republicar",
    confirmMessage?: string,
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setJobAction(action);
    try {
      const path =
        action === "pausar"
          ? "pausar"
          : action === "cerrar"
            ? "cerrar"
            : action === "activar"
              ? "activar"
              : "republicar";
      const res = await fetch(`/api/ops/ats/jobs/${job.id}/${path}`, { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Error");
        return;
      }
      if (action === "republicar" && json.data?.results) {
        const ok = (json.data.results as { ok: boolean }[]).some((r) => r.ok);
        toast[ok ? "success" : "error"](json.data.message || (ok ? "Listo" : "Revisa los canales"));
      } else {
        toast.success(
          action === "pausar"
            ? "Aviso pausado"
            : action === "cerrar"
              ? "Aviso cerrado"
              : action === "activar"
                ? "Aviso activado"
                : "Republicación enviada",
        );
      }
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setJobAction(null);
    }
  }

  async function submitEdit() {
    if (!editForm.titulo.trim() || editForm.descripcion.trim().length < 10 || !editForm.turno || !editForm.region) {
      toast.error("Completa título, descripción (mín. 10 caracteres), turno y región");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/ops/ats/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: editForm.titulo.trim(),
          descripcion: editForm.descripcion.trim(),
          turno: editForm.turno,
          region: editForm.region,
          commune: editForm.commune.trim() || null,
          installationId: editForm.installationId || null,
          rentaMin: editForm.rentaMin ? parseInt(editForm.rentaMin, 10) : null,
          rentaMax: editForm.rentaMax ? parseInt(editForm.rentaMax, 10) : null,
          vacantes: parseInt(editForm.vacantes, 10) || 1,
          requiereOS10: editForm.requiereOS10,
          requiereMovilizacion: editForm.requiereMovilizacion,
          genero: editForm.genero === "M" || editForm.genero === "F" ? editForm.genero : null,
          experienciaMinAnios: parseInt(editForm.experienciaMinAnios, 10) || 0,
          funciones: editForm.funciones.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Error al guardar");
        return;
      }
      toast.success("Cambios guardados");
      setEditOpen(false);
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setSavingEdit(false);
    }
  }

  const descartados = pipeline.get("DESCARTADO") ?? [];

  // Canales con actividad reciente (publicado, error o pendiente) para mostrar enlaces y estado
  const distributionChannels = job.channels.filter(
    (ch) => ch.activo && (ch.estado === "publicado" || ch.estado === "error" || ch.estado === "pendiente"),
  );

  return (
    <div className="space-y-4">
      {/* Enlaces públicos (cómo se ve en internet / feeds) */}
      <Card className="p-4 sm:p-6 space-y-3">
        <h3 className="font-semibold text-sm sm:text-base">Vista pública y feeds</h3>
        <p className="text-xs text-muted-foreground">
          Así indexan buscadores y agregadores el aviso. Copia el enlace o ábrelo para comprobarlo.
        </p>
        <div className="space-y-2 text-sm">
          {publicJobUrl ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/20 p-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">Página del empleo (JSON-LD / Google)</p>
                <a
                  href={publicJobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary break-all hover:underline text-xs"
                >
                  {publicJobUrl}
                </a>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    void navigator.clipboard.writeText(publicJobUrl).then(() => toast.success("Copiado"));
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                </Button>
                <Button size="sm" className="h-8" asChild>
                  <a href={publicJobUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-status-warn-fg dark:text-status-warn-fg">
              Activa el aviso para generar la URL pública indexable.
            </p>
          )}
          {feedXmlUrl && tenantSlug && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">Feed XML del tenant (Talent / agregadores)</p>
                <span className="text-xs break-all text-muted-foreground">{feedXmlUrl}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 shrink-0"
                onClick={() => {
                  void navigator.clipboard.writeText(feedXmlUrl).then(() => toast.success("URL del feed copiada"));
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar feed
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Distribution section — per job */}
      {(manualChannels.length > 0 || distributionChannels.length > 0) && (
        <Card className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm sm:text-base">Distribución de este aviso</h3>
          </div>

          {distributionChannels.length > 0 && (
            <div className="space-y-2">
              {distributionChannels.map((ch) => {
                const link = isHttpUrl(ch.externalId) ? ch.externalId! : publicJobUrl;
                const label =
                  ch.estado === "publicado"
                    ? "Publicado"
                    : ch.estado === "error"
                      ? "Error"
                      : "Pendiente";
                return (
                  <div
                    key={ch.canal}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm border rounded-lg p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={
                          ch.estado === "error"
                            ? "text-[10px] bg-status-danger-soft text-status-danger-fg"
                            : ch.estado === "pendiente"
                              ? "text-[10px] bg-status-warn-soft text-status-warn-fg"
                              : "text-[10px]"
                        }
                      >
                        {label}
                      </Badge>
                      <span className="font-medium capitalize">{ch.canal.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-1 min-w-0">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline truncate max-w-full"
                        >
                          {ch.estado === "error" || !isHttpUrl(ch.externalId)
                            ? "Ver página pública del empleo"
                            : "Ver enlace / rastreo"}
                        </a>
                      )}
                      {!link && ch.externalId && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-full" title={ch.externalId}>
                          {ch.externalId}
                        </span>
                      )}
                      {ch.estado === "error" && ch.errorDetalle && (
                        <span className="text-[11px] text-status-danger-fg dark:text-status-danger-fg max-w-full">
                          {ch.errorDetalle}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Manual channels — publish + paste URL */}
          {manualChannels.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Publica este aviso en los portales habilitados y pega el enlace para trazabilidad.
              </p>
              {manualChannels.map(({ key, label }) => {
                const portalUrl = MANUAL_PORTALS[key];
                const currentUrl = channelUrls[key] ?? "";
                return (
                  <div key={key} className="space-y-1.5 p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">{label}</span>
                      {portalUrl && (
                        <a
                          href={portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Ir a {label} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        type="url"
                        value={currentUrl}
                        onChange={(e) =>
                          setChannelUrls((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder="Pega la URL del aviso publicado..."
                        className="text-xs h-8 min-w-0 flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-8 text-xs w-full sm:w-auto"
                        disabled={!currentUrl || savingUrl === key}
                        onClick={() => saveChannelUrl(key, currentUrl)}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Acciones del aviso (editar, pausar, republicar indexación, cerrar) */}
      {job.estado !== "CERRADO" && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Estado: {job.estado}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Edita el texto y vuelve a publicar en canales; pausa sin cerrar; reindexa en Google tras cambios.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar aviso
              </Button>
              {job.estado === "ACTIVO" && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-9"
                    disabled={!!jobAction}
                    onClick={() =>
                      runJobAction(
                        "republicar",
                        "¿Volver a enviar a los canales activos (p. ej. indexación Google)?",
                      )
                    }
                  >
                    {jobAction === "republicar" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Reenviar a canales
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={!!jobAction}
                    onClick={() => runJobAction("pausar", "¿Pausar este aviso?")}
                  >
                    {jobAction === "pausar" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Pause className="h-3.5 w-3.5 mr-1" />
                    )}
                    Pausar
                  </Button>
                </>
              )}
              {(job.estado === "BORRADOR" || job.estado === "PAUSADO") && (
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={!!jobAction}
                  onClick={() => runJobAction("activar")}
                >
                  {jobAction === "activar" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1" />
                  )}
                  Activar
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-9"
                disabled={!!jobAction}
                onClick={() =>
                  runJobAction("cerrar", "¿Cerrar definitivamente este aviso? Se desactivarán los canales.")
                }
              >
                {jobAction === "cerrar" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                )}
                Cerrar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {job.estado === "CERRADO" && (
        <Card className="p-4 border-dashed">
          <p className="text-sm text-muted-foreground">
            Este aviso está cerrado y no se puede editar desde aquí. Crea uno nuevo desde{" "}
            <Link href="/ops/ats/nuevo" className="text-primary underline">
              Nuevo aviso
            </Link>
            .
          </p>
        </Card>
      )}

      {/* Kanban: en móvil scroll horizontal (5 columnas fijas eran ilegibles en vertical) */}
      <div className="md:hidden -mx-4 px-4">
        <p className="text-[11px] text-muted-foreground mb-2">
          Desliza horizontalmente para ver todas las etapas del pipeline.
        </p>
        <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory [-webkit-overflow-scrolling:touch] scrollbar-hide min-h-[min(70vh,520px)]">
          {ETAPAS.map((etapa) => {
            const apps = pipeline.get(etapa) ?? [];
            return (
              <div
                key={etapa}
                className={`rounded-lg p-3 shrink-0 w-[min(100%,18rem)] snap-start ${ETAPA_COLORS[etapa]}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">{ETAPA_LABELS[etapa]}</h4>
                  <Badge variant="secondary" className="text-xs">{apps.length}</Badge>
                </div>
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {apps.length === 0 && (
                    <div className="rounded-md border border-dashed border-muted-foreground/30 p-4 text-center text-xs text-muted-foreground">
                      Sin postulantes
                    </div>
                  )}
                  {apps.map((app) => (
                    <Card
                      key={app.id}
                      className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelected(app)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold shrink-0">
                          {app.guardia.persona.firstName[0]}
                          {app.guardia.persona.lastName[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-sm font-medium truncate">
                              {app.guardia.persona.firstName} {app.guardia.persona.lastName}
                            </p>
                            <CardActions app={app} jobId={job.id} onMove={moveEtapa} />
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            {app.guardia.os10 ? (
                              <ShieldCheck className="h-3 w-3 text-status-ok-fg" />
                            ) : (
                              <ShieldX className="h-3 w-3 text-status-danger-fg" />
                            )}
                            {app.guardia.persona.commune && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {app.guardia.persona.commune}
                              </span>
                            )}
                          </div>
                          {app.matchScore !== null && (
                            <div className="mt-1.5">
                              <Progress value={app.matchScore} className="h-1.5" />
                              <span className="text-xs text-muted-foreground">{app.matchScore}%</span>
                            </div>
                          )}
                          <Badge className={`text-[10px] mt-1 ${FUENTE_COLORS[app.fuente] ?? "bg-gray-100"}`} variant="secondary">
                            {app.fuente.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="hidden md:grid md:grid-cols-5 gap-3 min-h-[400px]">
        {ETAPAS.map((etapa) => {
          const apps = pipeline.get(etapa) ?? [];
          return (
            <DroppableColumn key={etapa} etapa={etapa} className={`rounded-lg p-3 ${ETAPA_COLORS[etapa]}`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">{ETAPA_LABELS[etapa]}</h4>
                <Badge variant="secondary" className="text-xs">{apps.length}</Badge>
              </div>
              <div className="space-y-2">
                {apps.length === 0 && (
                  <div className="rounded-md border border-dashed border-muted-foreground/30 p-4 text-center text-xs text-muted-foreground">
                    Sin postulantes
                  </div>
                )}
                {apps.map((app) => (
                  <DraggableCard key={app.id} app={app}>
                  <Card
                    className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelected(app)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold shrink-0">
                        {app.guardia.persona.firstName[0]}
                        {app.guardia.persona.lastName[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium truncate">
                            {app.guardia.persona.firstName} {app.guardia.persona.lastName}
                          </p>
                          <CardActions app={app} jobId={job.id} onMove={moveEtapa} />
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {app.guardia.os10 ? (
                            <ShieldCheck className="h-3 w-3 text-status-ok-fg" />
                          ) : (
                            <ShieldX className="h-3 w-3 text-status-danger-fg" />
                          )}
                          {app.guardia.persona.commune && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {app.guardia.persona.commune}
                            </span>
                          )}
                        </div>
                        {app.matchScore !== null && (
                          <div className="mt-1.5">
                            <Progress value={app.matchScore} className="h-1.5" />
                            <span className="text-xs text-muted-foreground">{app.matchScore}%</span>
                          </div>
                        )}
                        <Badge className={`text-[10px] mt-1 ${FUENTE_COLORS[app.fuente] ?? "bg-gray-100"}`} variant="secondary">
                          {app.fuente.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                  </DraggableCard>
                ))}
              </div>
            </DroppableColumn>
          );
        })}
      </div>
      </DndContext>

      {/* Descartados toggle */}
      {descartados.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDescartados(!showDescartados)}
          >
            Descartados ({descartados.length}) {showDescartados ? "▲" : "▼"}
          </Button>
          {showDescartados && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
              {descartados.map((app) => (
                <Card
                  key={app.id}
                  className="p-2 opacity-60 cursor-pointer"
                  onClick={() => setSelected(app)}
                >
                  <p className="text-xs truncate">
                    {app.guardia.persona.firstName} {app.guardia.persona.lastName}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full max-w-full sm:max-w-[540px] sm:w-[540px] p-4 sm:p-6 overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selected.guardia.persona.firstName} {selected.guardia.persona.lastName}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">RUT:</span>{" "}
                    {selected.guardia.persona.rut ?? "Sin RUT"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Código:</span>{" "}
                    {selected.guardia.code ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">OS10:</span>{" "}
                    {selected.guardia.os10 ? "Sí" : "No"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Experiencia:</span>{" "}
                    {selected.guardia.experienciaAnios ?? 0} años
                  </div>
                  <div>
                    <span className="text-muted-foreground">Región:</span>{" "}
                    {selected.guardia.persona.region ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Comuna:</span>{" "}
                    {selected.guardia.persona.commune ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fuente:</span>{" "}
                    <Badge className={FUENTE_COLORS[selected.fuente] ?? ""} variant="secondary">
                      {selected.fuente}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Etapa:</span>{" "}
                    <Badge variant="outline">{ETAPA_LABELS[selected.etapa]}</Badge>
                  </div>
                </div>

                {selected.matchScore !== null && (
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Match Score: {selected.matchScore}%
                    </p>
                    <Progress value={selected.matchScore} className="h-2" />
                    {selected.matchDetalle && (
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                        {Object.entries(selected.matchDetalle).map(([k, v]) => (
                          <div key={k}>
                            {k}: <span className="font-medium text-foreground">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selected.notasInternas && (
                  <div>
                    <p className="text-sm font-medium">Notas internas</p>
                    <p className="text-sm text-muted-foreground">{selected.notasInternas}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-4 border-t sm:flex-row sm:flex-wrap">
                  {NEXT_ETAPA[selected.etapa] && (
                    <Button
                      onClick={() => moveEtapa(selected.id, NEXT_ETAPA[selected.etapa])}
                      disabled={moving}
                      className="w-full sm:flex-1"
                    >
                      Mover a {ETAPA_LABELS[NEXT_ETAPA[selected.etapa]]}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                  {selected.etapa !== "DESCARTADO" && (
                    <Button
                      variant="destructive"
                      onClick={() => moveEtapa(selected.id, "DESCARTADO")}
                      disabled={moving}
                      className="w-full sm:w-auto"
                    >
                      Descartar
                    </Button>
                  )}
                  {selected.etapa === "DESCARTADO" && (
                    <Button
                      variant="outline"
                      onClick={() => moveEtapa(selected.id, "POSTULADO")}
                      disabled={moving}
                      className="w-full sm:flex-1"
                    >
                      Reactivar
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92vh] overflow-y-auto rounded-t-2xl p-4 sm:p-6 z-[60]"
        >
          <SheetHeader>
            <SheetTitle>Editar aviso</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div>
              <Label htmlFor="edit-titulo">Título *</Label>
              <Input
                id="edit-titulo"
                value={editForm.titulo}
                onChange={(e) => setEditForm((f) => ({ ...f, titulo: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-desc">Descripción *</Label>
              <Textarea
                id="edit-desc"
                rows={5}
                value={editForm.descripcion}
                onChange={(e) => setEditForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Turno *</Label>
                <Select value={editForm.turno} onValueChange={(v) => setEditForm((f) => ({ ...f, turno: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {TURNOS_EDIT.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Región *</Label>
                <Select value={editForm.region} onValueChange={(v) => setEditForm((f) => ({ ...f, region: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONES_EDIT.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="edit-commune">Comuna</Label>
              <Input
                id="edit-commune"
                value={editForm.commune}
                onChange={(e) => setEditForm((f) => ({ ...f, commune: e.target.value }))}
              />
            </div>
            <div>
              <Label>Instalación</Label>
              <Select
                value={editForm.installationId || "__none__"}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, installationId: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin instalación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin instalación</SelectItem>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                      {i.commune ? ` (${i.commune})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-renta-min">Renta mín. (CLP)</Label>
                <Input
                  id="edit-renta-min"
                  type="number"
                  value={editForm.rentaMin}
                  onChange={(e) => setEditForm((f) => ({ ...f, rentaMin: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-renta-max">Renta máx. (CLP)</Label>
                <Input
                  id="edit-renta-max"
                  type="number"
                  value={editForm.rentaMax}
                  onChange={(e) => setEditForm((f) => ({ ...f, rentaMax: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-vac">Vacantes</Label>
              <Input
                id="edit-vac"
                type="number"
                min={1}
                value={editForm.vacantes}
                onChange={(e) => setEditForm((f) => ({ ...f, vacantes: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.requiereOS10}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, requiereOS10: v }))}
                />
                <Label>Requiere OS10</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.requiereMovilizacion}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, requiereMovilizacion: v }))}
                />
                <Label>Movilización</Label>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Género</Label>
                <Select
                  value={editForm.genero || "any"}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, genero: v === "any" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Cualquiera</SelectItem>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Femenino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-exp">Experiencia mín. (años)</Label>
                <Input
                  id="edit-exp"
                  type="number"
                  min={0}
                  value={editForm.experienciaMinAnios}
                  onChange={(e) => setEditForm((f) => ({ ...f, experienciaMinAnios: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-func">Funciones</Label>
              <Textarea
                id="edit-func"
                rows={3}
                value={editForm.funciones}
                onChange={(e) => setEditForm((f) => ({ ...f, funciones: e.target.value }))}
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" className="w-full sm:flex-1" disabled={savingEdit} onClick={() => void submitEdit()}>
                {savingEdit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Guardar cambios
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
