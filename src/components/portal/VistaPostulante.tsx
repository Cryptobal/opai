"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Briefcase,
  ClipboardList,
  User,
  Loader2,
  MapPin,
  DollarSign,
  Shield,
  Star,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GuardSession } from "@/lib/guard-portal";
import { useIsIOS } from "@/hooks/usePlatform";

type PostulanteTab = "ofertas" | "mis-postulaciones" | "perfil";

interface VistaPostulanteProps {
  session: GuardSession;
  onLogout: () => void;
}

interface JobOffer {
  id: string;
  titulo: string;
  descripcion: string;
  region: string;
  commune: string | null;
  turno: string;
  vacantes: number;
  rentaMin: number | null;
  rentaMax: number | null;
  requiereOS10: boolean;
  requiereMovilizacion: boolean;
  experienciaMinAnios: number | null;
  matchScore: number;
  tenant: { id: string; name: string };
}

interface MyApplication {
  id: string;
  status: string;
  createdAt: string;
  jobPosting: {
    titulo: string;
    region: string;
    turno: string;
    tenant: { name: string };
  };
}

const TURNO_LABELS: Record<string, string> = {
  "4x4_dia": "4x4 Dia",
  "4x4_noche": "4x4 Noche",
  "5x2": "5x2",
  "6x1": "6x1",
  otro: "Otro",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NUEVA: { label: "Enviada", color: "bg-status-info-soft text-status-info-fg" },
  EN_REVISION: { label: "En revision", color: "bg-status-warn-soft text-status-warn-fg" },
  PRESELECCIONADO: { label: "Preseleccionado", color: "bg-status-ok-soft text-status-ok-fg" },
  ENTREVISTA: { label: "Entrevista", color: "bg-tint-violet text-tint-violet-fg" },
  SELECCIONADO: { label: "Seleccionado", color: "bg-status-ok-soft text-status-ok-fg" },
  DESCARTADO: { label: "No seleccionado", color: "bg-status-danger-soft text-status-danger-fg" },
  CONTRATADO: { label: "Contratado", color: "bg-status-info-soft text-status-info-fg" },
};

export function VistaPostulante({ session, onLogout }: VistaPostulanteProps) {
  const [tab, setTab] = useState<PostulanteTab>("ofertas");
  const isIOS = useIsIOS();

  return (
    <div className="min-h-screen bg-background flex flex-col w-full">
      {/* Header */}
      <header
        className={
          "sticky top-0 z-30 px-4 py-3 flex items-center justify-between " +
          (isIOS ? "opai-liquid-glass-bar-top" : "bg-background/95 backdrop-blur border-b")
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold break-words" title={`${session.firstName} ${session.lastName}`}>
              {session.firstName} {session.lastName}
            </p>
            <Badge variant="secondary" className="text-[10px] bg-status-warn-soft text-status-warn-fg border-0">
              Buscando empleo
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground break-words">Portal Guardia</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Cerrar sesion">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20 px-4 sm:px-6">
        {tab === "ofertas" && <OfertasDisponibles guardiaId={session.guardiaId} />}
        {tab === "mis-postulaciones" && <MisPostulaciones guardiaId={session.guardiaId} />}
        {tab === "perfil" && <PerfilPostulante session={session} />}
      </main>

      {/* Bottom nav */}
      <nav
        className={
          "fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around px-2 py-2 safe-area-bottom " +
          (isIOS ? "opai-liquid-glass-bar" : "bg-background/95 backdrop-blur border-t")
        }
      >
        <TabButton icon={<Briefcase className="h-5 w-5" />} label="Ofertas" active={tab === "ofertas"} onClick={() => setTab("ofertas")} />
        <TabButton icon={<ClipboardList className="h-5 w-5" />} label="Postulaciones" active={tab === "mis-postulaciones"} onClick={() => setTab("mis-postulaciones")} />
        <TabButton icon={<User className="h-5 w-5" />} label="Perfil" active={tab === "perfil"} onClick={() => setTab("perfil")} />
      </nav>
    </div>
  );
}

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${active ? "text-status-info-fg" : "text-muted-foreground"}`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function OfertasDisponibles({ guardiaId }: { guardiaId: string }) {
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/guardia/ofertas?guardiaId=${guardiaId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setOffers(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handlePostular(jobId: string) {
    setApplying(jobId);
    try {
      const res = await fetch("/api/portal/guardia/ofertas/postular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobPostingId: jobId, guardiaId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Postulacion enviada");
        setOffers((prev) => prev.filter((o) => o.id !== jobId));
      } else {
        toast.error(data.error || "Error al postular");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setApplying(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <Briefcase className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No hay ofertas disponibles en este momento</p>
        <p className="text-xs text-muted-foreground/70">Vuelve a revisar pronto</p>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-3">
      <h2 className="text-lg font-bold">Ofertas disponibles</h2>
      <p className="text-xs text-muted-foreground mb-4">
        {offers.length} oferta{offers.length !== 1 ? "s" : ""} ordenadas por compatibilidad
      </p>
      {offers.map((offer) => (
        <div key={offer.id} className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold break-words">{offer.titulo}</h3>
              <p className="text-xs text-muted-foreground break-words">{offer.tenant.name}</p>
            </div>
            {offer.matchScore > 0 && (
              <Badge variant="secondary" className="shrink-0 text-[10px] bg-status-info-soft text-status-info-fg border-0">
                <Star className="h-3 w-3 mr-0.5" />
                {offer.matchScore}%
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {offer.commune ? `${offer.commune}, ` : ""}{offer.region}
            </span>
            <span>{TURNO_LABELS[offer.turno] ?? offer.turno}</span>
            {offer.rentaMin && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ${offer.rentaMin.toLocaleString("es-CL")}
                {offer.rentaMax ? ` - $${offer.rentaMax.toLocaleString("es-CL")}` : "+"}
              </span>
            )}
            {offer.requiereOS10 && (
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                OS10
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2">{offer.descripcion}</p>

          <Button
            size="sm"
            className="w-full"
            onClick={() => handlePostular(offer.id)}
            disabled={applying === offer.id}
          >
            {applying === offer.id ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-1" />
            )}
            Postular
          </Button>
        </div>
      ))}
    </div>
  );
}

function MisPostulaciones({ guardiaId }: { guardiaId: string }) {
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/guardia/ofertas/mis-postulaciones?guardiaId=${guardiaId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setApplications(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Aun no has postulado a ninguna oferta</p>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-3">
      <h2 className="text-lg font-bold">Mis postulaciones</h2>
      {applications.map((app) => {
        const statusCfg = STATUS_LABELS[app.status] ?? { label: app.status, color: "bg-zinc-500/15 text-zinc-400" };
        return (
          <div key={app.id} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold break-words">{app.jobPosting.titulo}</h3>
                <p className="text-xs text-muted-foreground break-words">{app.jobPosting.tenant.name}</p>
              </div>
              <Badge variant="secondary" className={`shrink-0 text-[10px] border-0 ${statusCfg.color}`}>
                {statusCfg.label}
              </Badge>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>{app.jobPosting.region}</span>
              <span>{TURNO_LABELS[app.jobPosting.turno] ?? app.jobPosting.turno}</span>
              <span>{new Date(app.createdAt).toLocaleDateString("es-CL")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PerfilPostulante({ session }: { session: GuardSession }) {
  return (
    <div className="py-4 space-y-4">
      <h2 className="text-lg font-bold">Mi perfil</h2>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-status-info-soft flex items-center justify-center">
            <User className="h-6 w-6 text-status-info-fg" />
          </div>
          <div>
            <p className="text-sm font-semibold">{session.firstName} {session.lastName}</p>
            <p className="text-xs text-muted-foreground">RUT: {session.rut || "Sin RUT"}</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Codigo: {session.code || "Sin asignar"}</p>
          <p>Estado: {session.lifecycleStatus}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Para actualizar tus datos, contacta a recursos humanos.
      </p>
    </div>
  );
}
