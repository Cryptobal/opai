"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

      <Link href={`/personas/guardias/sueldos-rut?guardiaId=${guardiaId}`}>
        <Card className="cursor-pointer transition-colors hover:bg-muted/50 hover:border-primary/30">
          <CardContent className="pt-3 pb-2 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Base</p>
                <p className="text-sm font-medium">${salary.baseSalary.toLocaleString("es-CL")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Colación</p>
                <p className="text-sm font-medium">${salary.colacion.toLocaleString("es-CL")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Movilización</p>
                <p className="text-sm font-medium">${salary.movilizacion.toLocaleString("es-CL")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Bonos</p>
                <p className="text-sm font-medium">${totalBonos.toLocaleString("es-CL")}</p>
              </div>
            </div>

            {salary.bonos.length > 0 && (
              <div className="space-y-0.5 pt-1 border-t border-border/30">
                {salary.bonos.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground truncate">{b.bonoName}</span>
                    <span className="font-medium shrink-0">${b.amount.toLocaleString("es-CL")}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1.5 border-t border-border/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total haberes</span>
                <span className="text-sm font-semibold">${totalHaberes.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Dcto. legal est. (~20%)</span>
                <span className="text-xs text-red-400">-${descuentosEstimados.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Líquido estimado</span>
                <span className="text-sm font-bold text-emerald-400">${liquidoEstimado.toLocaleString("es-CL")}</span>
              </div>
            </div>
          </CardContent>
          <div className="px-3 pb-2 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            Ver en Sueldos por RUT
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </Card>
      </Link>
    </div>
  );
}
