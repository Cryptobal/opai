"use client";

import { Card, CardContent } from "@/components/ui/card";
import { IaUmbralesConfig } from "./IaUmbralesConfig";
import { IaRecommendations } from "./IaRecommendations";
import { cn } from "@/lib/utils";

const TRUST_FACTORS = [
  {
    weight: 30,
    name: "Checkpoints",
    color: "bg-emerald-500",
    desc1: "% puntos marcados",
    desc2: "del total de la plantilla",
  },
  {
    weight: 20,
    name: "Tiempo",
    color: "bg-blue-500",
    desc1: "Duración vs estimada",
    desc2: "de la plantilla",
  },
  {
    weight: 20,
    name: "Velocidad",
    color: "bg-purple-500",
    desc1: "Consistencia entre",
    desc2: "checkpoints consecutivos",
  },
  {
    weight: 15,
    name: "Secuencia",
    color: "bg-amber-500",
    desc1: "Orden de marcación",
    desc2: "vs plantilla configurada",
  },
  {
    weight: 15,
    name: "Puntualidad",
    color: "bg-teal-500",
    desc1: "Inicio de ronda vs",
    desc2: "hora programada",
  },
];

export function RondasCentroIaClient() {
  return (
    <div className="space-y-6">
      {/* 2 columns layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IaUmbralesConfig />
        <IaRecommendations />
      </div>

      {/* Trust Score explanation */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold mb-4">Cómo se calcula el Trust Score</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {TRUST_FACTORS.map((factor) => (
              <div
                key={factor.name}
                className="rounded-xl border border-border p-3 text-center"
              >
                <div className="flex items-center justify-center mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold",
                      factor.color,
                    )}
                  >
                    {factor.weight}%
                  </span>
                </div>
                <p className="text-sm font-semibold mb-1">{factor.name}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {factor.desc1}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {factor.desc2}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            El Trust Score final es el promedio ponderado de los 5 factores (0-100). Se calcula automáticamente al completar cada ronda.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
