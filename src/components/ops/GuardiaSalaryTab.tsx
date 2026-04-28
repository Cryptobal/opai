"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Building2,
  User,
  ChevronRight,
} from "lucide-react";

/* ── Types ──────────────────────────── */

interface ResolvedSalary {
  source: "RUT" | "PUESTO" | "NONE";
  structureId: string | null;
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationType: string;
  gratificationCustomAmount: number;
  bonos: Array<{
    bonoCatalogId: string;
    bonoName: string;
    bonoType: string;
    isTaxable: boolean;
    amount: number;
    percentage: number | null;
  }>;
  installationId: string | null;
  installationName: string | null;
  puestoId: string | null;
  puestoName: string | null;
  hasRutOverride: boolean;
}

/* ── Component ──────────────────────── */

export function GuardiaSalaryTab({ guardiaId }: { guardiaId: string }) {
  const [salary, setSalary] = useState<ResolvedSalary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSalary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/personas/guardias/${guardiaId}/salary-structure`);
      if (res.ok) {
        const json = await res.json();
        setSalary(json.data);
      }
    } catch (err) {
      console.error("Error loading salary:", err);
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => {
    loadSalary();
  }, [loadSalary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!salary || salary.source === "NONE") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No hay estructura de sueldo definida. El guardia no tiene asignación activa o el puesto no tiene sueldo configurado.
        </p>
      </div>
    );
  }

  const totalBonos = salary.bonos.reduce((sum, b) => sum + b.amount, 0);
  const totalHaberes = salary.baseSalary + salary.colacion + salary.movilizacion + totalBonos;
  const descuentosEstimados = Math.round(salary.baseSalary * 0.2);
  const liquidoEstimado = totalHaberes - descuentosEstimados;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {salary.source === "RUT" ? (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
            <User className="mr-1 h-3 w-3" />
            Por RUT
          </Badge>
        ) : (
          <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
            <Building2 className="mr-1 h-3 w-3" />
            Por Instalación
          </Badge>
        )}
        {salary.installationName && (
          <span className="text-[11px] text-muted-foreground truncate">
            {salary.installationName}
          </span>
        )}
      </div>

      <Link href={`/personas/guardias/sueldos-rut?guardiaId=${guardiaId}`} className="block">
        <div className="rounded-xl border border-border/60 bg-card/40 cursor-pointer transition-colors hover:bg-card/60 hover:border-border">
          <div className="p-4 sm:p-5 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="rounded-lg border border-border/40 bg-card/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Base</p>
                <p className="text-[13px] font-medium tabular-nums mt-1">${salary.baseSalary.toLocaleString("es-CL")}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-card/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Colación</p>
                <p className="text-[13px] font-medium tabular-nums mt-1">${salary.colacion.toLocaleString("es-CL")}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-card/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Movilización</p>
                <p className="text-[13px] font-medium tabular-nums mt-1">${salary.movilizacion.toLocaleString("es-CL")}</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-card/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Bonos</p>
                <p className="text-[13px] font-medium tabular-nums mt-1">${totalBonos.toLocaleString("es-CL")}</p>
              </div>
            </div>

            {salary.bonos.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/30">
                {salary.bonos.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground truncate">{b.bonoName}</span>
                    <span className="font-medium tabular-nums shrink-0">${b.amount.toLocaleString("es-CL")}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-border/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Total haberes</span>
                <span className="text-sm font-semibold tabular-nums">${totalHaberes.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Dcto. legal est. (~20%)</span>
                <span className="text-xs text-red-400 tabular-nums">-${descuentosEstimados.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Líquido estimado</span>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">${liquidoEstimado.toLocaleString("es-CL")}</span>
              </div>
            </div>
          </div>
          <div className="px-4 pb-3 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            Ver en Sueldos por RUT
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </Link>
    </div>
  );
}
