"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Clock,
  AlertTriangle,
  Receipt,
  Plus,
  FileText,
  Loader2,
  Briefcase,
  LayoutGrid,
  UserPlus,
} from "lucide-react";
import { KpiCard } from "@/components/opai/KpiCard";
import { SupervisorSession } from "@/lib/portal-supervisor";
import { SupervisorPautaGrid } from "./SupervisorPautaGrid";

interface DashboardData {
  visitasHoy: number;
  visitasCompletadas: number;
  hallazgosAbiertos: number;
  turnosExtraPendientes: number;
  rendicionesBorrador: number;
}

interface Props {
  session: SupervisorSession;
  onAction: (action: "nueva-visita" | "novedad" | "turno-extra" | "rendicion" | "visita-tecnica") => void;
  onMoreOpen?: () => void;
  visitasPendientes?: number;
}

export function SupervisorDashboard({ session, onAction, onMoreOpen, visitasPendientes = 0 }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ops/supervision/dashboard");
        if (res.ok) {
          const json = await res.json();
          setData({
            visitasHoy: json.data?.visitasHoy ?? 0,
            visitasCompletadas: json.data?.visitasCompletadas ?? 0,
            hallazgosAbiertos: json.data?.hallazgosAbiertos ?? 0,
            turnosExtraPendientes: json.data?.turnosExtraPendientes ?? 0,
            rendicionesBorrador: json.data?.rendicionesBorrador ?? 0,
          });
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-24">
      {/* Greeting */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Hola, {session.name.split(" ")[0]}</h1>
          <p className="text-sm text-zinc-400 capitalize">{today}</p>
        </div>
        <a
          href="/hub"
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors shrink-0 shadow-sm shadow-blue-900/50"
        >
          <LayoutGrid size={13} />
          <span>ERP</span>
        </a>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-zinc-600" size={24} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            title="Visitas hoy"
            value={data?.visitasHoy ?? 0}
            description={`${data?.visitasCompletadas ?? 0} completadas`}
            icon={<ClipboardCheck size={16} />}
            variant="blue"
            size="sm"
          />
          <KpiCard
            title="Hallazgos abiertos"
            value={data?.hallazgosAbiertos ?? 0}
            icon={<AlertTriangle size={16} />}
            variant={data?.hallazgosAbiertos ? "amber" : "default"}
            size="sm"
          />
          <KpiCard
            title="TEs pendientes"
            value={data?.turnosExtraPendientes ?? 0}
            icon={<Clock size={16} />}
            variant={data?.turnosExtraPendientes ? "purple" : "default"}
            size="sm"
          />
          <KpiCard
            title="Rendiciones borrador"
            value={data?.rendicionesBorrador ?? 0}
            icon={<Receipt size={16} />}
            variant={data?.rendicionesBorrador ? "amber" : "default"}
            size="sm"
          />
          <KpiCard
            title="Visitas por realizar"
            value={visitasPendientes}
            icon={<Briefcase size={16} />}
            variant={visitasPendientes > 0 ? "amber" : "default"}
            size="sm"
            onClick={visitasPendientes > 0 ? () => onAction("visita-tecnica") : undefined}
          />
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Acciones rápidas</p>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction
            label="Iniciar Visita"
            icon={<ClipboardCheck size={18} />}
            color="bg-blue-600 hover:bg-blue-500"
            onClick={() => onAction("nueva-visita")}
          />
          <QuickAction
            label="Visita Técnica"
            icon={<Briefcase size={18} />}
            color="bg-sky-600 hover:bg-sky-500"
            onClick={() => onAction("visita-tecnica")}
          />
          <QuickAction
            label="Novedad"
            icon={<AlertTriangle size={18} />}
            color="bg-amber-700 hover:bg-amber-600"
            onClick={() => onAction("novedad")}
          />
          <QuickAction
            label="Ingreso TE"
            icon={<UserPlus size={18} />}
            color="bg-purple-600 hover:bg-purple-500"
            onClick={() => onAction("turno-extra")}
          />
          <QuickAction
            label="Rendición"
            icon={<FileText size={18} />}
            color="bg-emerald-600 hover:bg-emerald-500"
            onClick={() => onAction("rendicion")}
          />
          <QuickAction
            label="Novedad Rápida"
            icon={<Plus size={18} />}
            color="bg-amber-500 hover:bg-amber-400"
            onClick={() => onAction("novedad")}
          />
        </div>
      </div>

      {/* Pauta Mensual */}
      <SupervisorPautaGrid installations={session.installations} />
    </div>
  );
}

function QuickAction({
  label,
  icon,
  color,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl text-white transition-colors ${color}`}
      style={{ minHeight: 68 }}
    >
      {icon}
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

