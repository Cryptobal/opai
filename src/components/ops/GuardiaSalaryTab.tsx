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

  return (
    <div className="space-y-4">
      {/* Source badge */}
      <div className="flex items-center gap-2">
        {salary.source === "RUT" ? (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">
            <User className="mr-1 h-3 w-3" />
            Sueldo por RUT
          </Badge>
        ) : (
          <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
            <Building2 className="mr-1 h-3 w-3" />
            Sueldo por Instalación
          </Badge>
        )}
        {salary.installationName && (
          <span className="text-xs text-muted-foreground">
            {salary.installationName} · {salary.puestoName}
          </span>
        )}
      </div>

      {/* Salary breakdown — clicable para ir a Sueldos por RUT */}
      <Link href={`/personas/guardias/sueldos-rut?guardiaId=${guardiaId}`}>
        <Card className="cursor-pointer transition-colors hover:bg-muted/50 hover:border-primary/30">
          <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sueldo base</p>
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total haberes</p>
              <p className="text-sm font-semibold text-emerald-400">${totalHaberes.toLocaleString("es-CL")}</p>
            </div>
          </div>

          {salary.bonos.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Bonos</p>
              <div className="space-y-1">
                {salary.bonos.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {b.bonoName}
                      {b.percentage != null && <span className="ml-1 text-[10px]">({b.percentage}%)</span>}
                    </span>
                    <span className="font-medium">
                      ${b.amount.toLocaleString("es-CL")}
                      <Badge variant="outline" className="ml-1 text-[8px]">
                        {b.isTaxable ? "Imp" : "No imp"}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
          <div className="px-4 pb-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            Ver en Sueldos por RUT
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </Card>
      </Link>
    </div>
  );
}
