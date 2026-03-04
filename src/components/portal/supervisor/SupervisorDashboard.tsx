"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Clock,
  AlertTriangle,
  Receipt,
  Plus,
  FileText,
  Bell,
  MapPin,
  Loader2,
} from "lucide-react";
import { KpiCard } from "@/components/opai/KpiCard";
import { SupervisorSession } from "@/lib/portal-supervisor";

interface DashboardData {
  visitasHoy: number;
  visitasCompletadas: number;
  hallazgosAbiertos: number;
  turnosExtraPendientes: number;
  rendicionesBorrador: number;
}

interface Props {
  session: SupervisorSession;
  onAction: (action: "nueva-visita" | "novedad" | "turno-extra" | "rendicion") => void;
}

export function SupervisorDashboard({ session, onAction }: Props) {
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
        // silently fail — KPIs are non-critical
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
      <div>
        <h1 className="text-lg font-semibold">Hola, {session.name.split(" ")[0]}</h1>
        <p className="text-sm text-zinc-400 capitalize">{today}</p>
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
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Acciones rápidas</p>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            label="Iniciar Visita"
            icon={<ClipboardCheck size={20} />}
            color="bg-blue-600 hover:bg-blue-500"
            onClick={() => onAction("nueva-visita")}
          />
          <QuickAction
            label="Registrar Novedad"
            icon={<Bell size={20} />}
            color="bg-amber-600 hover:bg-amber-500"
            onClick={() => onAction("novedad")}
          />
          <QuickAction
            label="Crear Turno Extra"
            icon={<Plus size={20} />}
            color="bg-purple-600 hover:bg-purple-500"
            onClick={() => onAction("turno-extra")}
          />
          <QuickAction
            label="Nueva Rendición"
            icon={<FileText size={20} />}
            color="bg-emerald-600 hover:bg-emerald-500"
            onClick={() => onAction("rendicion")}
          />
        </div>
      </div>

      {/* Mis instalaciones resumen */}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
          Mis instalaciones ({session.installations.length})
        </p>
        <div className="flex flex-col gap-2">
          {session.installations.slice(0, 3).map((inst) => (
            <div
              key={inst.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                <MapPin size={14} className="text-zinc-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{inst.name}</p>
                <p className="text-xs text-zinc-500 truncate">{inst.accountName}</p>
              </div>
              <div
                className={`ml-auto w-2 h-2 rounded-full flex-shrink-0 ${
                  inst.isActive ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
            </div>
          ))}
          {session.installations.length > 3 && (
            <p className="text-xs text-zinc-500 text-center">
              +{session.installations.length - 3} más
            </p>
          )}
        </div>
      </div>
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
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl text-white transition-colors ${color}`}
      style={{ minHeight: 80 }}
    >
      {icon}
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );
}
