"use client";

import { useState } from "react";
import { IaUmbralesConfig } from "./IaUmbralesConfig";
import { IaRecommendations } from "./IaRecommendations";
import { ChevronDown, History, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const TRUST_FACTORS = [
  { weight: 30, name: "Checkpoints", hex: "#22c55e", desc1: "% puntos marcados", desc2: "del total de la plantilla" },
  { weight: 20, name: "Tiempo",      hex: "#3b82f6", desc1: "Duración vs estimada", desc2: "de la plantilla" },
  { weight: 20, name: "Velocidad",   hex: "#a855f7", desc1: "Consistencia entre", desc2: "checkpoints consecutivos" },
  { weight: 15, name: "Secuencia",   hex: "#f59e0b", desc1: "Orden de marcación", desc2: "vs plantilla configurada" },
  { weight: 15, name: "Puntualidad", hex: "#2dd4bf", desc1: "Inicio de ronda vs", desc2: "hora programada" },
];

export function RondasCentroIaClient() {
  const [historialOpen, setHistorialOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#2dd4bf]/10 flex items-center justify-center">
          <Brain className="w-4 h-4 text-[#2dd4bf]" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-[#f1f5f9]">Centro IA</h2>
          <p className="text-[11px] text-[#64748b]">Detección automática de anomalías y recomendaciones inteligentes</p>
        </div>
      </div>

      {/* 2 columns: Detection + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IaUmbralesConfig />
        <IaRecommendations />
      </div>

      {/* Trust Score explanation */}
      <div className="rounded-xl border border-[#1e293b] bg-[#111827] p-5">
        <h3 className="text-[13px] font-semibold text-[#f1f5f9] mb-4">Cómo se calcula el Trust Score</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {TRUST_FACTORS.map((factor) => (
            <div
              key={factor.name}
              className="rounded-xl border border-[#1e293b] p-3 text-center"
              style={{ borderColor: `${factor.hex}20`, background: `${factor.hex}08` }}
            >
              <div className="flex items-center justify-center mb-2">
                <span
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold"
                  style={{ background: `${factor.hex}30`, color: factor.hex }}
                >
                  {factor.weight}%
                </span>
              </div>
              <p className="text-[13px] font-semibold text-[#f1f5f9] mb-1">{factor.name}</p>
              <p className="text-[11px] text-[#94a3b8] leading-tight">{factor.desc1}</p>
              <p className="text-[11px] text-[#94a3b8] leading-tight">{factor.desc2}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#64748b] mt-4 text-center">
          El Trust Score es el promedio ponderado de los 5 factores (0-100). Se calcula automáticamente al completar cada ronda.
        </p>
      </div>

      {/* Historial de recomendaciones (collapsible) */}
      <div className="rounded-xl border border-[#1e293b] overflow-hidden">
        <button
          onClick={() => setHistorialOpen((prev) => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#111827] hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#2dd4bf]" />
            <span className="text-[13px] font-semibold text-[#f1f5f9]">Historial de recomendaciones</span>
          </div>
          <ChevronDown className={cn(
            "w-4 h-4 text-[#64748b] transition-transform duration-200",
            historialOpen && "rotate-180"
          )} />
        </button>
        {historialOpen && (
          <div className="p-4 bg-[#111827] border-t border-[#1e293b]">
            <p className="text-[13px] text-[#64748b] text-center py-6">
              Las recomendaciones generadas anteriormente aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
