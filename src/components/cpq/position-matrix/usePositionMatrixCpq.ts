/**
 * Adapter CPQ para <PositionMatrix> — persistencia vía API REST.
 * Mapea CpqPosition[] / CpqServiceGroup[] ↔ NormalizedShift / NormalizedGroup
 * y traduce las mutaciones a los endpoints existentes de quotes/positions/services.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { normalizeWeekdays } from "@/lib/cpq/weekdays";
import type { RolCargoSalaryMap } from "@/lib/cpq/rol-cargo-salary";
import { useCpqCatalogs } from "@/lib/cpq/use-cpq-catalogs";
import type { CpqPosition, CpqServiceGroup } from "@/types/cpq";
import type {
  NormalizedGroup,
  NormalizedShift,
  PositionMatrixAdapter,
  ShiftPatch,
  TemplateRowSeed,
} from "./types";

interface Opts {
  quoteId: string;
  positions: CpqPosition[];
  serviceGroups: CpqServiceGroup[];
  refresh: () => void;
  currency: string;
  ufValue?: number | null;
  readOnly?: boolean;
}

function patchToBody(patch: ShiftPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.puestoId !== undefined) body.puestoTrabajoId = patch.puestoId;
  if (patch.cargoId !== undefined) body.cargoId = patch.cargoId;
  if (patch.rolId !== undefined) body.rolId = patch.rolId;
  if (patch.inicio !== undefined) body.startTime = patch.inicio;
  if (patch.fin !== undefined) body.endTime = patch.fin;
  if (patch.dias !== undefined) body.weekdays = patch.dias;
  if (patch.guardias !== undefined) body.numGuards = patch.guardias;
  if (patch.nPuestos !== undefined) body.numPuestos = patch.nPuestos;
  if (patch.bruto !== undefined) body.baseSalary = patch.bruto;
  return body;
}

export function usePositionMatrixCpq(opts: Opts): PositionMatrixAdapter {
  const { quoteId, positions, serviceGroups, refresh, currency, ufValue, readOnly } = opts;
  const { puestos, cargos, roles } = useCpqCatalogs();
  const [salaryMap, setSalaryMap] = useState<RolCargoSalaryMap>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch("/api/cpq/rol-cargo-salary")
      .then((r) => r.json())
      .then((d) => { if (d.success) setSalaryMap(d.data || {}); })
      .catch(() => {});
  }, []);

  const rows: NormalizedShift[] = useMemo(
    () =>
      positions.map((p) => ({
        id: p.id,
        groupKey: p.serviceGroupId ?? null,
        puestoId: p.puestoTrabajoId,
        cargoId: p.cargoId,
        rolId: p.rolId,
        inicio: p.startTime,
        fin: p.endTime,
        dias: normalizeWeekdays(p.weekdays),
        guardias: p.numGuards,
        nPuestos: p.numPuestos || 1,
        bruto: Number(p.baseSalary),
        liquido: p.netSalary != null ? Number(p.netSalary) : null,
        costo: Number(p.monthlyPositionCost),
        costoPorGuardia: Number(p.employerCost),
      })),
    [positions]
  );

  const groups: NormalizedGroup[] = useMemo(
    () =>
      serviceGroups.map((g) => ({
        key: g.id,
        name: g.name,
        pattern: g.coveragePattern,
        order: g.displayOrder,
      })),
    [serviceGroups]
  );

  const defaults = useMemo(
    () => ({
      puestoTrabajoId: puestos[0]?.id,
      cargoId: cargos[0]?.id,
      rolId: roles[0]?.id,
    }),
    [puestos, cargos, roles]
  );

  const ensureDefaults = useCallback(() => {
    if (!defaults.puestoTrabajoId || !defaults.cargoId || !defaults.rolId) {
      toast.error("Configura al menos un puesto, cargo y rol en CPQ antes de agregar turnos");
      return false;
    }
    return true;
  }, [defaults]);

  const insertRow = useCallback(
    async (serviceGroupId: string | null, seed?: TemplateRowSeed) => {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...defaults,
          serviceGroupId,
          weekdays: seed?.dias ?? ["Lun", "Mar", "Mié", "Jue", "Vie"],
          startTime: seed?.inicio ?? "08:00",
          endTime: seed?.fin ?? "20:00",
          numGuards: seed?.guardias ?? 1,
          numPuestos: seed?.nPuestos ?? 1,
          baseSalary: seed?.bruto ?? 550000,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "Error");
    },
    [quoteId, defaults]
  );

  const onAddRow = useCallback(
    async (groupKey: string | null) => {
      if (!ensureDefaults()) return;
      try {
        await insertRow(groupKey);
        refresh();
      } catch {
        toast.error("No se pudo agregar el turno");
      }
    },
    [ensureDefaults, insertRow, refresh]
  );

  const onUpdateRow = useCallback(
    (id: string, patch: ShiftPatch) => {
      if (timers.current[id]) clearTimeout(timers.current[id]);
      setSavingRowId(id);
      timers.current[id] = setTimeout(async () => {
        try {
          const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchToBody(patch)),
          });
          const d = await res.json();
          if (!d.success) throw new Error(d.error || "Error");
          refresh();
        } catch {
          toast.error("No se pudo guardar el turno");
        } finally {
          setSavingRowId((cur) => (cur === id ? null : cur));
        }
      }, 500);
    },
    [quoteId, refresh]
  );

  const onCloneRow = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${id}/clone`, { method: "POST" });
        const d = await res.json();
        if (!d.success) throw new Error(d.error);
        toast.success("Turno duplicado");
        refresh();
      } catch {
        toast.error("No se pudo duplicar");
      }
    },
    [quoteId, refresh]
  );

  const onDeleteRow = useCallback(
    async (id: string) => {
      if (!confirm("¿Eliminar este turno?")) return;
      try {
        await fetch(`/api/cpq/quotes/${quoteId}/positions/${id}`, { method: "DELETE" });
        refresh();
      } catch {
        toast.error("No se pudo eliminar");
      }
    },
    [quoteId, refresh]
  );

  const onRenameGroup = useCallback(
    async (groupKey: string, name: string) => {
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/services/${groupKey}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error);
        refresh();
      } catch {
        toast.error("No se pudo renombrar");
      }
    },
    [quoteId, refresh]
  );

  const onDeleteGroup = useCallback(
    async (groupKey: string) => {
      if (!confirm("¿Eliminar este servicio? Los turnos quedarán sin agrupar.")) return;
      try {
        await fetch(`/api/cpq/quotes/${quoteId}/services/${groupKey}`, { method: "DELETE" });
        refresh();
      } catch {
        toast.error("No se pudo eliminar el servicio");
      }
    },
    [quoteId, refresh]
  );

  const onAddGroup = useCallback(
    async (name: string, templateRows?: TemplateRowSeed[]) => {
      if (!ensureDefaults()) return;
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, coveragePattern: "custom", skipShifts: true }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error);
        const groupId = d.data.id as string;
        if (templateRows?.length) {
          for (const seed of templateRows) await insertRow(groupId, seed);
        }
        refresh();
      } catch {
        toast.error("No se pudo crear el servicio");
      }
    },
    [ensureDefaults, quoteId, insertRow, refresh]
  );

  return {
    rows,
    groups,
    catalogs: { puestos, cargos, roles },
    salaryMap,
    currency,
    ufValue,
    readOnly,
    savingRowId,
    onAddRow,
    onUpdateRow,
    onCloneRow,
    onDeleteRow,
    onRenameGroup,
    onDeleteGroup,
    onAddGroup,
  };
}
