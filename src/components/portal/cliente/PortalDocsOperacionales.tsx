"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  FileText,
  ExternalLink,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  User,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DocPortal = {
  tipo: string;
  status: string;
  expiresAt: string | null;
  fileUrl?: string;
  fileName?: string;
};

type GuardiaPortal = {
  nombre: string;
  rut: string | null;
  documentos: { tipo: string; status: string; expiresAt: string | null }[];
};

type InstalacionPortal = {
  id: string;
  nombre: string;
  cumplimiento: { porcentaje: number; total: number; vigentes: number };
  documentos: {
    globales: DocPortal[];
    instalacion: DocPortal[];
    guardias: GuardiaPortal[];
  };
};

interface Props {
  selectedInstallation?: string;
  isProspect?: boolean;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "vigente" || status === "no_aplica") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "por_vencer") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (status === "vencido") return <XCircle className="h-4 w-4 text-red-400" />;
  return <Circle className="h-4 w-4 text-zinc-600" />;
}

function StatusBadge({ status, expiresAt }: { status: string; expiresAt?: string | null }) {
  const styles: Record<string, string> = {
    vigente: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    por_vencer: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    vencido: "bg-red-500/15 text-red-400 border-red-500/30",
    no_aplica: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    sin_documento: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  };
  const labels: Record<string, string> = {
    vigente: "Vigente",
    por_vencer: "Por vencer",
    vencido: "Vencido",
    no_aplica: "Sin vencimiento",
    sin_documento: "Sin documento",
  };

  let extra = "";
  if (status === "por_vencer" && expiresAt) {
    const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff > 0) extra = ` (${diff}d)`;
  }

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", styles[status] || styles.sin_documento)}>
      {labels[status] || "Sin documento"}{extra}
    </span>
  );
}

export function PortalDocsOperacionales({ selectedInstallation, isProspect }: Props) {
  const [instalaciones, setInstalaciones] = useState<InstalacionPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeInstId, setActiveInstId] = useState<string>(selectedInstallation || "");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    globales: true,
    instalacion: true,
    guardias: false,
  });

  useEffect(() => {
    setLoading(true);
    fetch("/api/portal/cliente/docs-operacionales")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setInstalaciones(data.data.instalaciones);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sincroniza la pestaña activa cuando el selector global cambia la instalación
  // o cuando terminó de cargar la data. Antes usaba `[]` + eslint-disable y se
  // quedaba desincronizado al cambiar de instalación en el header.
  useEffect(() => {
    if (selectedInstallation && selectedInstallation !== activeInstId) {
      setActiveInstId(selectedInstallation);
      return;
    }
    if (!activeInstId && instalaciones.length > 0) {
      setActiveInstId(instalaciones[0].id);
    }
  }, [selectedInstallation, instalaciones, activeInstId]);

  if (isProspect) {
    return (
      <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-4 py-3 text-xs text-teal-300/80">
        Al activar tu servicio, aquí encontrarás el cumplimiento normativo completo de tu instalación (OS10, DT, seguros).
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (instalaciones.length === 0) {
    return (
      <div className="text-center py-16">
        <ShieldCheck className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-zinc-400">Sin documentos operacionales disponibles</p>
        <p className="text-xs text-zinc-500 mt-1">La documentación normativa se actualiza automáticamente.</p>
      </div>
    );
  }

  const active = instalaciones.find((i) => i.id === activeInstId) || instalaciones[0];

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allVigente = active.cumplimiento.vigentes === active.cumplimiento.total;

  return (
    <div className="space-y-4">
      {/* Installation selector */}
      {instalaciones.length > 1 && (
        <div className="flex gap-1 bg-zinc-800/50 p-1 rounded-lg overflow-x-auto">
          {instalaciones.map((inst) => (
            <button
              key={inst.id}
              onClick={() => setActiveInstId(inst.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                activeInstId === inst.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              {inst.nombre}
              <span className="ml-1.5 text-[10px]">({inst.cumplimiento.porcentaje}%)</span>
            </button>
          ))}
        </div>
      )}

      {/* Compliance banner */}
      {allVigente ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-300">
              Esta instalación cumple con toda la documentación OS10 y DT requerida
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-300">
                Cumplimiento normativo: {active.cumplimiento.porcentaje}%
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {active.cumplimiento.vigentes} de {active.cumplimiento.total} documentos vigentes
              </p>
            </div>
            <p className="text-2xl font-bold text-amber-300">{active.cumplimiento.porcentaje}%</p>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${active.cumplimiento.porcentaje}%` }}
            />
          </div>
        </div>
      )}

      {/* Globales */}
      <PortalSection
        title="Documentos Globales (empresa)"
        count={active.documentos.globales.length}
        expanded={expandedSections.globales}
        onToggle={() => toggleSection("globales")}
      >
        {active.documentos.globales.map((d, i) => (
          <DocRow key={i} doc={d} />
        ))}
      </PortalSection>

      {/* Instalación */}
      <PortalSection
        title="Documentos de la Instalación"
        count={active.documentos.instalacion.length}
        expanded={expandedSections.instalacion}
        onToggle={() => toggleSection("instalacion")}
      >
        {active.documentos.instalacion.length === 0 ? (
          <p className="text-xs text-zinc-500 py-2">Sin documentos de instalación cargados.</p>
        ) : (
          active.documentos.instalacion.map((d, i) => (
            <DocRow key={i} doc={d} />
          ))
        )}
      </PortalSection>

      {/* Guardias */}
      <PortalSection
        title="Personal Asignado"
        count={active.documentos.guardias.length}
        expanded={expandedSections.guardias}
        onToggle={() => toggleSection("guardias")}
      >
        {active.documentos.guardias.length === 0 ? (
          <p className="text-xs text-zinc-500 py-2">Sin personal asignado.</p>
        ) : (
          <div className="space-y-2">
            {active.documentos.guardias.map((g, i) => (
              <GuardiaCard key={i} guardia={g} />
            ))}
          </div>
        )}
      </PortalSection>
    </div>
  );
}

function PortalSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-left"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
        <span className="text-sm font-medium text-zinc-300 flex-1">{title}</span>
        <span className="text-xs text-zinc-500">{count}</span>
      </button>
      {expanded && <div className="divide-y divide-white/[0.04] px-3 py-1">{children}</div>}
    </div>
  );
}

function DocRow({ doc }: { doc: DocPortal }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <StatusIcon status={doc.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{doc.tipo}</p>
        {doc.expiresAt && (
          <p className="text-xs text-zinc-500">
            Vence: {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC" }).format(new Date(doc.expiresAt))}
          </p>
        )}
      </div>
      <StatusBadge status={doc.status} expiresAt={doc.expiresAt} />
      {doc.fileUrl && (
        <div className="flex items-center gap-1 shrink-0">
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Ver">
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </a>
          <a href={`${doc.fileUrl}?download=true`} download={doc.fileName} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Descargar">
            <Download className="h-3.5 w-3.5 text-zinc-400" />
          </a>
        </div>
      )}
    </div>
  );
}

function GuardiaCard({ guardia }: { guardia: GuardiaPortal }) {
  const [expanded, setExpanded] = useState(false);
  const vigentes = guardia.documentos.filter((d) => d.status === "vigente" || d.status === "no_aplica").length;

  return (
    <div className="rounded-md border border-white/[0.05] overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-2.5 py-2 text-left hover:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-500" />}
        <User className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-sm flex-1">{guardia.nombre}</span>
        {guardia.rut && <span className="text-xs text-zinc-600">{guardia.rut}</span>}
        <span className={cn(
          "text-xs font-medium ml-2",
          vigentes === guardia.documentos.length ? "text-emerald-400" : "text-amber-400"
        )}>
          {vigentes}/{guardia.documentos.length}
        </span>
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 space-y-1">
          {guardia.documentos.map((d, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <StatusIcon status={d.status} />
              <span className="text-xs flex-1">{d.tipo}</span>
              <StatusBadge status={d.status} expiresAt={d.expiresAt} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
