"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { portalFetch } from "@/lib/portal-cliente-fetch";

interface Tipo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  capa: string;
  obligatorio: boolean;
  normativa: string | null;
}

interface Verificacion {
  id: string;
  presente: boolean;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  supervisorName: string | null;
}

interface Item {
  tipo: Tipo;
  verificacion: Verificacion | null;
  estado: "presente" | "ausente" | "sin_verificar";
}

interface Payload {
  items: Item[];
  resumen: {
    total: number;
    presentes: number;
    ausentes: number;
    sinVerificar: number;
  };
}

interface Props {
  installationId: string;
}

const ESTADO_CFG: Record<
  Item["estado"],
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  presente: {
    label: "Presente",
    color: "text-status-ok-fg",
    Icon: CheckCircle2,
  },
  ausente: {
    label: "Ausente",
    color: "text-status-danger-fg",
    Icon: XCircle,
  },
  sin_verificar: {
    label: "Sin verificar",
    color: "text-zinc-500",
    Icon: Circle,
  },
};

export function PortalDocsFisicosChecklist({ installationId }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      try {
        const res = await portalFetch(
          `/api/portal/cliente/instalaciones/${installationId}/docs-fisicos`
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "No se pudo cargar el checklist");
        }
        if (!cancelled) setData(json.data as Payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [installationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Cargando checklist físico…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-400">
        No se pudo cargar el checklist: {error}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-6 text-center text-xs text-zinc-500">
        No hay documentos físicos configurados para esta instalación.
      </div>
    );
  }

  const { items, resumen } = data;
  const porcentajeVerif =
    resumen.total > 0
      ? Math.round(((resumen.presentes + resumen.ausentes) / resumen.total) * 100)
      : 0;
  const allOk =
    resumen.total > 0 &&
    resumen.presentes === resumen.total &&
    resumen.ausentes === 0 &&
    resumen.sinVerificar === 0;

  const instalacionItems = items.filter((i) => i.tipo.capa === "instalacion");
  const globalItems = items.filter((i) => i.tipo.capa === "global");

  return (
    <div className="rounded-xl border border-zinc-800 bg-white/[0.02] overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-4 py-3 bg-white/[0.03] border-b border-zinc-800 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
        <ClipboardList className="h-4 w-4 text-status-info-fg shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100">
            Checklist de documentos físicos
          </p>
          <p className="text-[11px] text-zinc-500">
            {resumen.presentes}/{resumen.total} presentes
            {resumen.ausentes > 0 && ` · ${resumen.ausentes} ausentes`}
            {resumen.sinVerificar > 0 && ` · ${resumen.sinVerificar} sin verificar`}
          </p>
        </div>
        <span
          className={cn(
            "text-xs font-bold tabular-nums shrink-0",
            allOk
              ? "text-status-ok-fg"
              : resumen.ausentes > 0
              ? "text-status-danger-fg"
              : "text-status-warn-fg"
          )}
        >
          {porcentajeVerif}%
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-white/[0.04]">
          {instalacionItems.length > 0 && (
            <ChecklistSection title="De la instalación" items={instalacionItems} />
          )}
          {globalItems.length > 0 && (
            <ChecklistSection title="Empresa (globales)" items={globalItems} />
          )}
        </div>
      )}
    </div>
  );
}

function ChecklistSection({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <ItemRow key={item.tipo.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  const cfg = ESTADO_CFG[item.estado];
  const { Icon } = cfg;
  const [showPhoto, setShowPhoto] = useState(false);

  return (
    <div className="flex items-start gap-3 py-1.5">
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", cfg.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-zinc-200 truncate">{item.tipo.nombre}</p>
          {item.tipo.obligatorio && (
            <span className="text-[9px] uppercase font-semibold text-amber-400/90 tracking-wider">
              Obligatorio
            </span>
          )}
        </div>
        {item.tipo.normativa && (
          <p className="text-[10px] text-zinc-500">{item.tipo.normativa}</p>
        )}
        {item.verificacion ? (
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Última verificación:{" "}
            {new Date(item.verificacion.createdAt).toLocaleDateString("es-CL", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            {item.verificacion.supervisorName
              ? ` · ${item.verificacion.supervisorName}`
              : ""}
          </p>
        ) : (
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Aún no se ha verificado en visita.
          </p>
        )}
        {item.verificacion?.notes && (
          <p className="text-[11px] text-zinc-400 italic mt-1 line-clamp-2">
            “{item.verificacion.notes}”
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span
          className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full border",
            item.estado === "presente"
              ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
              : item.estado === "ausente"
              ? "bg-status-danger-soft text-status-danger-fg border-status-danger-border"
              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
          )}
        >
          {cfg.label}
        </span>
        {item.verificacion?.photoUrl && (
          <button
            onClick={() => setShowPhoto(true)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Ver foto de evidencia"
          >
            <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        )}
      </div>

      {showPhoto && item.verificacion?.photoUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowPhoto(false)}
        >
          <img
            src={item.verificacion.photoUrl}
            alt={`Evidencia ${item.tipo.nombre}`}
            className="max-h-[80vh] max-w-full rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
