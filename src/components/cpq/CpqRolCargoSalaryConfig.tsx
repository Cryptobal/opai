/**
 * CpqRolCargoSalaryConfig
 *
 * Grilla de sueldos brutos preconfigurados por Rol × Cargo (día / noche).
 * Filas = roles activos, columnas = cargos activos. Autosave con debounce.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, Loader2, Moon, Sun } from "lucide-react";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { toast } from "sonner";

interface CatalogOption {
  id: string;
  name: string;
}
interface SalaryEntry {
  salaryDay: number;
  salaryNight: number;
}
type SalaryMap = Record<string, Record<string, SalaryEntry>>;

const EMPTY: SalaryEntry = { salaryDay: 0, salaryNight: 0 };

export function CpqRolCargoSalaryConfig() {
  const [roles, setRoles] = useState<CatalogOption[]>([]);
  const [cargos, setCargos] = useState<CatalogOption[]>([]);
  const [map, setMap] = useState<SalaryMap>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      try {
        const [rRes, cRes, mRes] = await Promise.all([
          fetch("/api/cpq/roles?active=true"),
          fetch("/api/cpq/cargos?active=true"),
          fetch("/api/cpq/rol-cargo-salary"),
        ]);
        const [r, c, m] = await Promise.all([rRes.json(), cRes.json(), mRes.json()]);
        if (r.success) setRoles(r.data);
        if (c.success) setCargos(c.data);
        if (m.success) setMap(m.data || {});
      } catch {
        toast.error("No se pudieron cargar los sueldos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(
    async (rolId: string, cargoId: string, entry: SalaryEntry) => {
      const key = `${rolId}:${cargoId}`;
      setSavingKey(key);
      try {
        const res = await fetch("/api/cpq/rol-cargo-salary", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rolId, cargoId, ...entry }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error || "Error");
      } catch {
        toast.error("No se pudo guardar el sueldo");
      } finally {
        setSavingKey((k) => (k === key ? null : k));
      }
    },
    []
  );

  const update = (rolId: string, cargoId: string, patch: Partial<SalaryEntry>) => {
    setMap((prev) => {
      const current = prev[rolId]?.[cargoId] ?? EMPTY;
      const nextEntry = { ...current, ...patch };
      const key = `${rolId}:${cargoId}`;
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => persist(rolId, cargoId, nextEntry), 600);
      return { ...prev, [rolId]: { ...(prev[rolId] ?? {}), [cargoId]: nextEntry } };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (roles.length === 0 || cargos.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Necesitas al menos un rol y un cargo activos para configurar sueldos.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <p className="text-sm text-muted-foreground">
          Sueldo bruto sugerido (CLP) por cruce Rol × Cargo. Se autocompleta al
          crear un turno; día y noche por separado.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rol / Cargo
              </th>
              {cargos.map((cargo) => (
                <th
                  key={cargo.id}
                  className="min-w-[180px] px-3 py-2 text-left text-xs font-semibold text-foreground"
                >
                  {cargo.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((rol) => (
              <tr key={rol.id} className="border-t border-border">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 text-xs font-medium text-foreground">
                  {rol.name}
                </td>
                {cargos.map((cargo) => {
                  const entry = map[rol.id]?.[cargo.id] ?? EMPTY;
                  const key = `${rol.id}:${cargo.id}`;
                  return (
                    <td key={cargo.id} className="px-2 py-1.5 align-top">
                      <div className="flex items-center gap-1.5">
                        <SalaryInput
                          icon="day"
                          value={entry.salaryDay}
                          onChange={(v) => update(rol.id, cargo.id, { salaryDay: v })}
                        />
                        <SalaryInput
                          icon="night"
                          value={entry.salaryNight}
                          onChange={(v) => update(rol.id, cargo.id, { salaryNight: v })}
                        />
                        {savingKey === key && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalaryInput({
  icon,
  value,
  onChange,
}: {
  icon: "day" | "night";
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 rounded border border-border bg-background px-1.5 h-10 sm:h-9">
      {icon === "day" ? (
        <Sun className="h-3.5 w-3.5 text-status-warn-fg shrink-0" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-primary shrink-0" />
      )}
      <input
        type="text"
        inputMode="numeric"
        aria-label={icon === "day" ? "Sueldo diurno" : "Sueldo nocturno"}
        value={value ? formatNumber(value, { minDecimals: 0, maxDecimals: 0 }) : ""}
        placeholder="0"
        onChange={(e) => onChange(parseLocalizedNumber(e.target.value) || 0)}
        className="w-[72px] bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
