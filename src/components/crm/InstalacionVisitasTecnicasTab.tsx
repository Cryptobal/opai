"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  ClipboardList,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  Phone,
  Calendar,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Briefcase,
} from "lucide-react";
import { EmptyState } from "@/components/opai/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PuestoItem {
  name: string;
  cargo: string | null;
  numGuards: number;
  numPuestos: number;
  startTime: string;
  endTime: string;
  weekdays: string[];
}

interface VisitaTecnica {
  id: string;
  status: string;
  scheduledAt: string | null;
  scheduledContact: string | null;
  scheduledPhone: string | null;
  puestosDetail: PuestoItem[] | null;
  quoteId: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  durationMinutes: number | null;
  generalReport: string | null;
  securityRisks: string | null;
  recommendations: string | null;
  photos: string[] | null;
  guardsNeeded: number | null;
  guardShiftType: string | null;
  requiresTransport: boolean;
  requiresMeals: boolean;
  requiresExams: boolean;
  requiresEquipment: boolean;
  requiresUniform: boolean;
  surveyContactName: string | null;
  surveyContactRole: string | null;
  surveyVisitOpinion: string | null;
  createdAt: string;
  supervisor: { id: string; name: string; email: string };
  account: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
}

type SubTab = "pendientes" | "realizadas";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: React.ReactNode }> = {
  programada: { label: "Pendiente", variant: "outline", icon: <Calendar className="h-3 w-3" /> },
  borrador: { label: "Borrador", variant: "secondary", icon: <FileText className="h-3 w-3" /> },
  en_curso: { label: "En curso", variant: "default", icon: <MapPin className="h-3 w-3" /> },
  completada: { label: "Completada", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
};

const SHIFT_LABELS: Record<string, string> = {
  diurno: "Diurno", nocturno: "Nocturno", "24h": "24 horas", rotativo: "Rotativo",
};

const OPINION_LABELS: Record<string, string> = {
  excelente: "Excelente", buena: "Buena", regular: "Regular", mala: "Mala",
};

interface Props {
  installationId: string;
}

export function InstalacionVisitasTecnicasTab({ installationId }: Props) {
  const [visitas, setVisitas] = useState<VisitaTecnica[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("pendientes");

  useEffect(() => {
    load();
  }, [installationId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/installations/${installationId}/visitas-tecnicas`);
      const json = await res.json();
      if (json.success) setVisitas(json.data ?? []);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  const pendientes = visitas.filter((v) => ["programada", "borrador", "en_curso"].includes(v.status));
  const realizadas = visitas.filter((v) => v.status === "completada");

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
        <button
          onClick={() => setSubTab("pendientes")}
          className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            subTab === "pendientes"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          Por realizar
          {pendientes.length > 0 && (
            <span className="ml-1 rounded-full bg-orange-500/15 text-orange-600 text-[10px] font-bold px-1.5 py-0.5">
              {pendientes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab("realizadas")}
          className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            subTab === "realizadas"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Realizadas
          {realizadas.length > 0 && (
            <span className="ml-1 rounded-full bg-emerald-500/15 text-emerald-600 text-[10px] font-bold px-1.5 py-0.5">
              {realizadas.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subTab === "pendientes" ? (
        pendientes.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-8 w-8" />}
            title="Sin visitas pendientes"
            description="Las visitas técnicas programadas desde cotizaciones aparecerán aquí."
          />
        ) : (
          <div className="space-y-3">
            {pendientes.map((v) => (
              <PendienteCard key={v.id} visita={v} />
            ))}
          </div>
        )
      ) : realizadas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="Sin visitas completadas"
          description="Las visitas técnicas completadas por supervisores aparecerán aquí con el informe completo."
        />
      ) : (
        <div className="space-y-3">
          {realizadas.map((v) => (
            <RealizadaCard key={v.id} visita={v} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card: Visita Pendiente ────────────────────────────────────────────────

function PendienteCard({ visita }: { visita: VisitaTecnica }) {
  const cfg = STATUS_CONFIG[visita.status] ?? STATUS_CONFIG.programada;

  const fecha = visita.scheduledAt
    ? new Date(visita.scheduledAt).toLocaleDateString("es-CL", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      })
    : null;
  const hora = visita.scheduledAt
    ? new Date(visita.scheduledAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          {fecha && (
            <p className="text-sm font-semibold capitalize">{fecha} {hora && `· ${hora}`}</p>
          )}
          {!fecha && (
            <p className="text-sm text-muted-foreground italic">Sin fecha programada</p>
          )}
        </div>
        <Badge variant={cfg.variant} className="flex items-center gap-1 flex-shrink-0 text-[10px]">
          {cfg.icon} {cfg.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Supervisor" value={visita.supervisor.name} />
        {visita.scheduledContact && (
          <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Contacto" value={visita.scheduledContact} />
        )}
        {visita.scheduledPhone && (
          <InfoRow
            icon={<Phone className="h-3.5 w-3.5" />}
            label="Teléfono"
            value={
              <a href={`tel:${visita.scheduledPhone}`} className="text-primary hover:underline">
                {visita.scheduledPhone}
              </a>
            }
          />
        )}
        {visita.quoteId && (
          <InfoRow
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Cotización"
            value={
              <a
                href={`/crm/cotizaciones/${visita.quoteId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                Ver cotización <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        )}
      </div>

      {/* Puestos */}
      {visita.puestosDetail && visita.puestosDetail.length > 0 && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Puestos requeridos
          </p>
          {visita.puestosDetail.map((p, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              • {p.name}{p.cargo ? ` — ${p.cargo}` : ""} · {p.numGuards} guardia{p.numGuards !== 1 ? "s" : ""} · {p.startTime}–{p.endTime}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card: Visita Realizada ─────────────────────────────────────────────────

function RealizadaCard({ visita }: { visita: VisitaTecnica }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const checkIn = visita.checkInAt
    ? new Date(visita.checkInAt).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const checkInTime = visita.checkInAt
    ? new Date(visita.checkInAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null;
  const checkOutTime = visita.checkOutAt
    ? new Date(visita.checkOutAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null;

  const services = [
    visita.requiresTransport && "Transporte",
    visita.requiresMeals && "Alimentación",
    visita.requiresExams && "Exámenes",
    visita.requiresEquipment && "Equipamiento",
    visita.requiresUniform && "Uniforme",
  ].filter(Boolean) as string[];

  const photos: string[] = Array.isArray(visita.photos) ? visita.photos : [];

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          {checkIn && (
            <p className="text-sm font-semibold">
              {checkIn} · {checkInTime}{checkOutTime ? `–${checkOutTime}` : ""}
              {visita.durationMinutes && (
                <span className="text-muted-foreground font-normal text-xs ml-1.5">
                  ({visita.durationMinutes} min)
                </span>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Supervisor: {visita.supervisor.name}</p>
        </div>
        <Badge variant="default" className="flex items-center gap-1 flex-shrink-0 text-[10px] bg-emerald-600/20 text-emerald-500 border-emerald-600/30">
          <CheckCircle2 className="h-3 w-3" /> Completada
        </Badge>
      </div>

      {/* Contacto en sitio */}
      {(visita.surveyContactName || visita.surveyContactRole) && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {visita.surveyContactName}{visita.surveyContactRole ? ` — ${visita.surveyContactRole}` : ""}
            {visita.surveyVisitOpinion && (
              <span className="ml-2 text-foreground font-medium">
                · Opinión: {OPINION_LABELS[visita.surveyVisitOpinion] ?? visita.surveyVisitOpinion}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Guardias y servicios */}
      <div className="flex flex-wrap gap-2 items-center">
        {visita.guardsNeeded != null && (
          <span className="text-xs bg-muted rounded-full px-2.5 py-0.5 flex items-center gap-1">
            <User className="h-3 w-3" />
            {visita.guardsNeeded} guardia{visita.guardsNeeded !== 1 ? "s" : ""}
            {visita.guardShiftType && ` · ${SHIFT_LABELS[visita.guardShiftType] ?? visita.guardShiftType}`}
          </span>
        )}
        {services.map((s) => (
          <span key={s} className="text-xs bg-blue-500/10 text-blue-500 rounded-full px-2.5 py-0.5">
            {s}
          </span>
        ))}
      </div>

      {/* Informe general (truncado, expandible) */}
      {visita.generalReport && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Informe</p>
          <p className={`text-xs text-muted-foreground leading-relaxed ${!expanded ? "line-clamp-3" : ""}`}>
            {visita.generalReport}
          </p>
        </div>
      )}

      {/* Riesgos */}
      {visita.securityRisks && expanded && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Riesgos identificados
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{visita.securityRisks}</p>
        </div>
      )}

      {/* Recomendaciones */}
      {visita.recommendations && expanded && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recomendaciones</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{visita.recommendations}</p>
        </div>
      )}

      {/* Fotos */}
      {photos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fotos ({photos.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {(expanded ? photos : photos.slice(0, 4)).map((url, i) => (
              <button
                key={i}
                onClick={() => setLightboxImg(url)}
                className="w-16 h-16 rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
              >
                <img src={url} alt={`foto ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
            {!expanded && photos.length > 4 && (
              <div className="w-16 h-16 rounded-lg border border-border bg-muted/50 flex items-center justify-center">
                <span className="text-xs text-muted-foreground font-medium">+{photos.length - 4}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expandir/colapsar */}
      {(visita.generalReport || visita.securityRisks || visita.recommendations || photos.length > 4) && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground h-7"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Ver menos</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver informe completo</>
          )}
        </Button>
      )}

      {/* Lightbox simple */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <img src={lightboxImg} alt="foto visita técnica" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 text-muted-foreground flex-shrink-0">{icon}</span>
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground">{value}</span>
      </div>
    </div>
  );
}
