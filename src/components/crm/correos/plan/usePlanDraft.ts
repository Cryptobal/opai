"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AiPlanDraft,
  CreateCrmStructureInclude,
  CrmStructureProposal,
  CrmStructureAssumption,
  PlanAttachmentSelection,
  PlanMilestone,
  PlanQuoteInput,
  PlanTaskOverride,
} from "@/modules/crm/email/email-to-crm-structure.types";
import type { StagedFile } from "@/modules/crm/email/email-to-lead.types";
import {
  emptyCrmStructureProposal,
  milestonesFromLicitacion,
} from "@/modules/crm/email/email-to-crm-structure.types";
import { recalcProposalStaffing } from "./staffing-local";

// Tiny path setter — no lodash dep needed
function setByPath(obj: unknown, path: string, value: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  const parts = path.split(".");
  const out = Array.isArray(obj) ? [...obj] : { ...(obj as Record<string, unknown>) };
  if (parts.length === 1) {
    (out as Record<string, unknown>)[parts[0]] = value;
    return out;
  }
  const [head, ...rest] = parts;
  const child = (out as Record<string, unknown>)[head];
  (out as Record<string, unknown>)[head] = setByPath(child, rest.join("."), value);
  return out;
}

export type PlanDraftState = {
  proposal: CrmStructureProposal;
  include: CreateCrmStructureInclude;
  locks: string[];
  selectedIds: Set<string>;
  taskOverride: PlanTaskOverride;
  attachmentSelection: PlanAttachmentSelection;
  quoteInput: PlanQuoteInput;
  milestones: PlanMilestone[];
  stagedFiles: StagedFile[];
  draftSavedAt: string | null;
  dirty: boolean;
};

const defaultInclude: CreateCrmStructureInclude = {
  contact: true,
  deal: true,
  installations: true,
  attachments: true,
  followUpTask: false,
  quote: false,
  milestones: false,
};

const defaultQuoteInput: PlanQuoteInput = {
  name: "",
  currency: "UF",
  contractDuration: 12,
  isOngoingService: true,
  validUntil: null,
};

const defaultAttachmentSelection: PlanAttachmentSelection = {
  storageKeys: [],
  target: "deal",
};

/** Fuente de verdad de `include` a partir de la selección del plan. */
export function includeFromSelectedIds(
  ids: Set<string>,
): CreateCrmStructureInclude {
  return {
    contact: ids.has("contact"),
    deal: ids.has("deal"),
    installations: ids.has("installations"),
    attachments: ids.has("attachments"),
    followUpTask: ids.has("followUpTask"),
    quote: ids.has("quote"),
    milestones: ids.has("milestones"),
  };
}

export function selectedIdsFromInclude(
  include: CreateCrmStructureInclude | null | undefined,
): Set<string> {
  const ids = new Set<string>(["account"]);
  if (include?.contact !== false) ids.add("contact");
  if (include?.deal !== false) ids.add("deal");
  if (include?.installations !== false) ids.add("installations");
  if (include?.attachments !== false) ids.add("attachments");
  if (include?.followUpTask) ids.add("followUpTask");
  if (include?.quote) ids.add("quote");
  if (include?.milestones) ids.add("milestones");
  return ids;
}

export function usePlanDraft(threadId: string) {
  const [proposal, setProposal] = useState<CrmStructureProposal>(emptyCrmStructureProposal);
  const [include, setInclude] = useState<CreateCrmStructureInclude>(defaultInclude);
  const [locks, setLocks] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [taskOverride, setTaskOverride] = useState<PlanTaskOverride>({});
  const [attachmentSelection, setAttachmentSelection] = useState<PlanAttachmentSelection>(defaultAttachmentSelection);
  const [quoteInput, setQuoteInput] = useState<PlanQuoteInput>(defaultQuoteInput);
  const [milestones, setMilestones] = useState<PlanMilestone[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const extrasRef = useRef({
    taskOverride,
    attachmentSelection,
    quoteInput,
    milestones,
  });
  extrasRef.current = { taskOverride, attachmentSelection, quoteInput, milestones };

  const saveDraft = useCallback(
    async (p: CrmStructureProposal, inc: CreateCrmStructureInclude, lks: string[]) => {
      try {
        const extras = extrasRef.current;
        const res = await fetch(`/api/crm/correos/${threadId}/plan-draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal: p,
            include: inc,
            locks: lks,
            taskOverride: extras.taskOverride,
            attachmentSelection: extras.attachmentSelection,
            quoteInput: extras.quoteInput,
            milestones: extras.milestones,
          }),
        });
        if (res.ok) {
          const j = (await res.json()) as { savedAt?: string };
          setDraftSavedAt(j.savedAt ?? new Date().toISOString());
          setDirty(false);
        }
      } catch {
        // silent — autosave best-effort
      }
    },
    [threadId],
  );

  const scheduleAutosave = useCallback(
    (p: CrmStructureProposal, inc: CreateCrmStructureInclude, lks: string[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void saveDraft(p, inc, lks), 800);
    },
    [saveDraft],
  );

  /** Set a nested field on proposal, add the path to locks, mark dirty. */
  const setField = useCallback(
    (path: string, value: unknown) => {
      setProposal((prev) => {
        let next = setByPath(prev, path, value) as CrmStructureProposal;
        // contacts[] es fuente de verdad: espejar el primario en `contact`.
        if (path === "contacts" && Array.isArray(value)) {
          const list = value as CrmStructureProposal["contacts"];
          const primary =
            list?.find((c) => c.selected !== false) ?? list?.[0] ?? prev.contact;
          next = { ...next, contact: primary };
        }
        setLocks((lks) => {
          const newLocks = lks.includes(path) ? lks : [...lks, path];
          scheduleAutosave(next, include, newLocks);
          return newLocks;
        });
        setDirty(true);
        return next;
      });
    },
    [include, scheduleAutosave],
  );

  /**
   * Igual que `setField` pero recalculando dotación en cliente en el mismo
   * `setProposal`: sin fetch, sin flicker y sin que el normalizador server
   * descarte los puestos que el usuario acaba de agregar.
   */
  const setFieldAndRecalc = useCallback(
    (
      path: "installations" | "weeklyHoursPerWorker" | "reservePct",
      value: unknown,
    ) => {
      setProposal((prev) => {
        const patched = setByPath(prev, path, value) as CrmStructureProposal;
        const next = recalcProposalStaffing(patched);
        setLocks((lks) => {
          const newLocks = lks.includes(path) ? lks : [...lks, path];
          scheduleAutosave(next, include, newLocks);
          return newLocks;
        });
        setDirty(true);
        return next;
      });
    },
    [include, scheduleAutosave],
  );

  /** Cobertura editada en la tabla → recalcula HH / dotación / KPIs al instante. */
  const setInstallationsAndRecalc = useCallback(
    (installations: CrmStructureProposal["installations"]) => {
      setFieldAndRecalc("installations", installations);
    },
    [setFieldAndRecalc],
  );

  /** Parámetros de dotación (hoy solo la reserva %; la jornada es fija 42 h). */
  const setStaffingParam = useCallback(
    (field: "weeklyHoursPerWorker" | "reservePct", value: number) => {
      setFieldAndRecalc(field, value);
    },
    [setFieldAndRecalc],
  );

  const setIncludePartial = useCallback((partial: Partial<CreateCrmStructureInclude>) => {
    setInclude((prev) => {
      const next = { ...prev, ...partial };
      setDirty(true);
      return next;
    });
  }, []);

  const toggleAction = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Hitos y plazo de agenda dependen del negocio.
        if (id === "deal") {
          next.delete("milestones");
          next.delete("agendaDeadline");
        }
      } else {
        next.add(id);
      }
      const nextInclude = includeFromSelectedIds(next);
      setInclude(nextInclude);
      scheduleAutosave(proposal, nextInclude, locks);
      return next;
    });
    setDirty(true);
  }, [locks, proposal, scheduleAutosave]);

  /** Aplica un preset de selección (account siempre implícito). */
  const applyPreset = useCallback(
    (ids: string[]) => {
      const next = new Set(["account", ...ids]);
      const nextInclude = includeFromSelectedIds(next);
      setSelectedIds(next);
      setInclude(nextInclude);
      scheduleAutosave(proposal, nextInclude, locks);
      setDirty(true);
    },
    [locks, proposal, scheduleAutosave],
  );

  const setAssumptions = useCallback((items: CrmStructureAssumption[]) => {
    setProposal((prev) => ({ ...prev, assumptionItems: items }));
    setDirty(true);
  }, []);

  /** Reset state to a fresh AI proposal (no locks). */
  const resetToAi = useCallback(
    (newProposal: CrmStructureProposal, staged?: StagedFile[]) => {
      // Mismo cálculo puro que el servidor; solo corrige jornadas > 42 h.
      setProposal(recalcProposalStaffing(newProposal));
      setLocks([]);
      setDirty(false);
      setDraftSavedAt(null);
      // Sembrar hitos desde el pliego cuando el draft no trae hitos guardados.
      const seeded = milestonesFromLicitacion(
        newProposal.licitacion,
        newProposal.installations[0],
      );
      setMilestones(seeded);
      if (staged) setStagedFiles(staged);
    },
    [],
  );

  const loadDraft = useCallback(async (): Promise<AiPlanDraft | null> => {
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/plan-draft`);
      if (!res.ok) return null;
      const j = (await res.json()) as { draft?: AiPlanDraft };
      if (!j.draft) return null;
      const d = j.draft;
      // Drafts guardados con jornada 44 / 45 se cargan y recalculan a 42.
      setProposal(recalcProposalStaffing(d.proposal));
      setInclude(d.include ?? defaultInclude);
      setLocks(d.locks ?? []);
      setTaskOverride(d.taskOverride ?? {});
      setAttachmentSelection(d.attachmentSelection ?? defaultAttachmentSelection);
      setQuoteInput(d.quoteInput ?? defaultQuoteInput);
      // Drafts viejos sin milestones: sembrar desde proposal.licitacion si existe.
      const savedMs = d.milestones ?? [];
      setMilestones(
        savedMs.length > 0
          ? savedMs
          : milestonesFromLicitacion(
              d.proposal?.licitacion,
              d.proposal?.installations?.[0],
            ),
      );
      setDraftSavedAt(d.savedAt);
      setDirty(false);
      // Selección por defecto desde include del borrador.
      setSelectedIds(selectedIdsFromInclude(d.include));
      return d;
    } catch {
      return null;
    }
  }, [threadId]);

  const clearDraft = useCallback(async () => {
    try {
      await fetch(`/api/crm/correos/${threadId}/plan-draft`, { method: "DELETE" });
    } catch {
      // silent
    }
    setDraftSavedAt(null);
    setDirty(false);
  }, [threadId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    proposal,
    include,
    locks,
    selectedIds,
    taskOverride,
    attachmentSelection,
    quoteInput,
    milestones,
    stagedFiles,
    draftSavedAt,
    dirty,
    setField,
    setInstallationsAndRecalc,
    setStaffingParam,
    setInclude: setIncludePartial,
    toggleAction,
    applyPreset,
    setAssumptions,
    resetToAi,
    loadDraft,
    clearDraft,
    setTaskOverride,
    setAttachmentSelection,
    setQuoteInput,
    setMilestones,
    setStagedFiles,
    setSelectedIds,
    setProposal,
  };
}
