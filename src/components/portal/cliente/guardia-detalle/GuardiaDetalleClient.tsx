"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { GuardiaHeader } from "./GuardiaHeader";
import { TabInfo } from "./TabInfo";
import { TabDocumentos } from "./TabDocumentos";
import { TabExamenes } from "./TabExamenes";
import { TabPsicologico } from "./TabPsicologico";
import { TabSupervision } from "./TabSupervision";
import { TabDesempeno } from "./TabDesempeno";
import type { GuardiaDetalle } from "./types";

interface Props {
  guardiaId: string;
}

type TabKey =
  | "info"
  | "documentos"
  | "examenes"
  | "psicologico"
  | "supervision"
  | "desempeno";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "info", label: "Info" },
  { key: "documentos", label: "Documentos" },
  { key: "examenes", label: "Exámenes" },
  { key: "psicologico", label: "Psicológico" },
  { key: "supervision", label: "Supervisión" },
  { key: "desempeno", label: "Desempeño" },
];

export function GuardiaDetalleClient({ guardiaId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<GuardiaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("info");

  useEffect(() => {
    let active = true;
    fetch(`/api/portal/cliente/guardias/${guardiaId}`)
      .then((r) => r.json())
      .then((res) => {
        if (!active) return;
        if (res.success) setData(res.data);
        else setError(res.error || "No se pudo cargar el guardia");
        setLoading(false);
      })
      .catch((err) => {
        console.error("[GuardiaDetalleClient] fetch error:", err);
        if (active) {
          setError("Error al cargar la ficha del guardia");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [guardiaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen gap-2 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando ficha...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al equipo
        </button>
        <p className="text-sm text-status-danger-fg">{error ?? "Guardia no encontrado"}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-4 pb-24">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al equipo
      </button>

      <GuardiaHeader info={data.info} />

      <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-white/[0.06] mb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                active
                  ? "text-status-info-fg border-status-info"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "info" && <TabInfo data={data} />}
        {tab === "documentos" && <TabDocumentos documentos={data.documentos} />}
        {tab === "examenes" && <TabExamenes examenes={data.examenesProtocolos} />}
        {tab === "psicologico" && <TabPsicologico psicologico={data.psicologico} />}
        {tab === "supervision" && <TabSupervision supervision={data.supervision} />}
        {tab === "desempeno" && <TabDesempeno desempeno={data.desempeno} />}
      </div>
    </div>
  );
}
