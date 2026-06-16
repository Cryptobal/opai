/**
 * Adapter Lead para <PositionMatrix> — persistencia en memoria (config.positions
 * del JSON del lead, sin API de positions). Reusa makeServiceGroupKey y el
 * payrollPreview que el padre ya calcula (disableLivePreview).
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { makeServiceGroupKey } from "@/lib/crm/lead-service-group";
import { normalizeWeekdays } from "@/lib/cpq/weekdays";
import type { RolCargoSalaryMap } from "@/lib/cpq/rol-cargo-salary-shared";
import type { LeadCpqConfig, LeadPositionItem } from "@/components/crm/LeadInstallationCpq";
import { isNightShift } from "./shift-utils";
import type {
  CpqCatalogOption,
  NormalizedGroup,
  NormalizedShift,
  PositionMatrixAdapter,
  ShiftPatch,
  TemplateRowSeed,
} from "./types";

interface Opts {
  config: LeadCpqConfig;
  update: (patch: Partial<LeadCpqConfig>) => void;
  cpqPuestos: CpqCatalogOption[];
  cpqCargos: CpqCatalogOption[];
  cpqRoles: CpqCatalogOption[];
  catalogDefaults?: { puestoId: string; puestoName: string; cargoId: string; rolId: string };
  payrollPreview: Array<{ employerCostPerGuard: number; netSalary: number }>;
  ufValue?: number | null;
  currency: string;
}

const DEFAULT_DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];

export function usePositionMatrixLead(opts: Opts): PositionMatrixAdapter {
  const {
    config, update, cpqPuestos, cpqCargos, cpqRoles, catalogDefaults,
    payrollPreview, ufValue, currency,
  } = opts;
  const positions = config.positions;

  const [salaryMap, setSalaryMap] = useState<RolCargoSalaryMap>({});
  useEffect(() => {
    fetch("/api/cpq/rol-cargo-salary")
      .then((r) => r.json())
      .then((d) => { if (d.success) setSalaryMap(d.data || {}); })
      .catch(() => {});
  }, []);

  const defaults = useMemo(
    () => ({
      puestoTrabajoId: catalogDefaults?.puestoId || cpqPuestos[0]?.id,
      puesto: catalogDefaults?.puestoName || cpqPuestos[0]?.name || "Control de Acceso",
      cargoId: catalogDefaults?.cargoId || cpqCargos[0]?.id,
      rolId: catalogDefaults?.rolId || cpqRoles[0]?.id,
    }),
    [catalogDefaults, cpqPuestos, cpqCargos, cpqRoles]
  );

  const rows: NormalizedShift[] = useMemo(
    () =>
      positions.map((p, i) => {
        const pre = payrollPreview[i];
        const guards = (p.cantidad || 1) * (p.numPuestos || 1);
        const inicio = p.horaInicio || (p.shiftType === "night" ? "20:00" : "08:00");
        return {
          id: String(i),
          groupKey: p.serviceGroupKey ?? null,
          puestoId: p.puestoTrabajoId || catalogDefaults?.puestoId || "",
          cargoId: p.cargoId || catalogDefaults?.cargoId || "",
          rolId: p.rolId || catalogDefaults?.rolId || "",
          inicio,
          fin: p.horaFin || (p.shiftType === "night" ? "08:00" : "20:00"),
          dias: normalizeWeekdays(p.dias),
          guardias: p.cantidad || 1,
          nPuestos: p.numPuestos || 1,
          bruto: Number(p.baseSalary) || 550000,
          liquido: pre ? pre.netSalary : null,
          costoPorGuardia: pre ? pre.employerCostPerGuard : null,
          costo: pre ? pre.employerCostPerGuard * guards : null,
        };
      }),
    [positions, payrollPreview, catalogDefaults]
  );

  const groups: NormalizedGroup[] = useMemo(() => {
    const map = new Map<string, NormalizedGroup>();
    for (const p of positions) {
      if (!p.serviceGroupKey || map.has(p.serviceGroupKey)) continue;
      map.set(p.serviceGroupKey, {
        key: p.serviceGroupKey,
        name: p.serviceGroupName || "Servicio",
        pattern: p.serviceGroupPattern,
        order: p.serviceGroupOrder ?? 0,
      });
    }
    return Array.from(map.values());
  }, [positions]);

  const patchToItem = (patch: ShiftPatch): Partial<LeadPositionItem> => {
    const out: Partial<LeadPositionItem> = {};
    if (patch.puestoId !== undefined) {
      out.puestoTrabajoId = patch.puestoId;
      out.puesto = cpqPuestos.find((p) => p.id === patch.puestoId)?.name || undefined;
    }
    if (patch.cargoId !== undefined) out.cargoId = patch.cargoId;
    if (patch.rolId !== undefined) out.rolId = patch.rolId;
    if (patch.inicio !== undefined) {
      out.horaInicio = patch.inicio;
      out.shiftType = isNightShift(patch.inicio) ? "night" : "day";
    }
    if (patch.fin !== undefined) out.horaFin = patch.fin;
    if (patch.dias !== undefined) out.dias = patch.dias;
    if (patch.guardias !== undefined) out.cantidad = patch.guardias;
    if (patch.nPuestos !== undefined) out.numPuestos = patch.nPuestos;
    if (patch.bruto !== undefined) out.baseSalary = patch.bruto;
    return out;
  };

  const buildRow = (seed: TemplateRowSeed | undefined, group?: NormalizedGroup): LeadPositionItem => {
    const inicio = seed?.inicio ?? "08:00";
    return {
      puestoTrabajoId: defaults.puestoTrabajoId,
      puesto: defaults.puesto,
      cargoId: defaults.cargoId,
      rolId: defaults.rolId,
      baseSalary: seed?.bruto ?? 550000,
      shiftType: isNightShift(inicio) ? "night" : "day",
      cantidad: seed?.guardias ?? 2,
      numPuestos: seed?.nPuestos ?? 1,
      horaInicio: inicio,
      horaFin: seed?.fin ?? "20:00",
      dias: seed?.dias ?? DEFAULT_DIAS,
      ...(group
        ? {
            serviceGroupKey: group.key,
            serviceGroupName: group.name,
            serviceGroupOrder: group.order,
            serviceGroupPattern: group.pattern as LeadPositionItem["serviceGroupPattern"],
          }
        : {}),
    };
  };

  return {
    rows,
    groups,
    catalogs: { puestos: cpqPuestos, cargos: cpqCargos, roles: cpqRoles },
    salaryMap,
    currency,
    ufValue,
    disableLivePreview: true,
    onAddRow: (groupKey) => {
      const group = groupKey ? groups.find((g) => g.key === groupKey) : undefined;
      update({ positions: [...positions, buildRow(undefined, group)] });
    },
    onUpdateRow: (id, patch) => {
      const idx = Number(id);
      const next = [...positions];
      if (!next[idx]) return;
      next[idx] = { ...next[idx], ...patchToItem(patch) };
      update({ positions: next });
    },
    onCloneRow: (id) => {
      const idx = Number(id);
      if (!positions[idx]) return;
      const clone = { ...positions[idx], dias: [...positions[idx].dias] };
      const next = [...positions];
      next.splice(idx + 1, 0, clone);
      update({ positions: next });
    },
    onDeleteRow: (id) => {
      const idx = Number(id);
      update({ positions: positions.filter((_, i) => i !== idx) });
    },
    onRenameGroup: (groupKey, name) => {
      update({
        positions: positions.map((p) =>
          p.serviceGroupKey === groupKey ? { ...p, serviceGroupName: name } : p
        ),
      });
    },
    onDeleteGroup: (groupKey) => {
      update({
        positions: positions.map((p) =>
          p.serviceGroupKey === groupKey
            ? {
                ...p,
                serviceGroupKey: undefined,
                serviceGroupName: undefined,
                serviceGroupOrder: undefined,
                serviceGroupPattern: undefined,
                serviceGroupIcon: undefined,
              }
            : p
        ),
      });
    },
    onAddGroup: (name, templateRows) => {
      const key = makeServiceGroupKey();
      const order = positions.reduce((mx, p) => Math.max(mx, p.serviceGroupOrder ?? 0), 0) + 1;
      const group: NormalizedGroup = { key, name, order };
      const seeds = templateRows?.length ? templateRows : [undefined];
      const newItems = seeds.map((seed) => buildRow(seed, group));
      update({ positions: [...positions, ...newItems] });
    },
  };
}
