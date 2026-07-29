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
        const next = setByPath(prev, path, value) as CrmStructureProposal;
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
      return next;
    });
    setDirty(true);
  }, []);

  /** Aplica un preset de selección (account siempre implícito). */
  const applyPreset = useCallback((ids: string[]) => {
    setSelectedIds(new Set(["account", ...ids]));
    setDirty(true);
  }, []);

  const setAssumptions = useCallback((items: CrmStructureAssumption[]) => {
    setProposal((prev) => ({ ...prev, assumptionItems: items }));
    setDirty(true);
  }, []);

  /** Reset state to a fresh AI proposal (no locks). */
  const resetToAi = useCallback(
    (newProposal: CrmStructureProposal, staged?: StagedFile[]) => {
      setProposal(newProposal);
      setLocks([]);
      setDirty(false);
      setDraftSavedAt(null);
      // Sembrar hitos desde el pliego cuando el draft no trae hitos guardados.
      const seeded = milestonesFromLicitacion(newProposal.licitacion);
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
      setProposal(d.proposal);
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
          : milestonesFromLicitacion(d.proposal?.licitacion),
      );
      setDraftSavedAt(d.savedAt);
      setDirty(false);
      // Selección por defecto desde include del borrador.
      const ids = new Set<string>(["account"]);
      if (d.include?.contact !== false) ids.add("contact");
      if (d.include?.deal !== false) ids.add("deal");
      if (d.include?.installations !== false) ids.add("installations");
      if (d.include?.attachments !== false) ids.add("attachments");
      if (d.include?.followUpTask) ids.add("followUpTask");
      if (d.include?.quote) ids.add("quote");
      if (d.include?.milestones) ids.add("milestones");
      setSelectedIds(ids);
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

  const recalcStaffing = useCallback(async (override?: CrmStructureProposal) => {
    const body = override ?? proposal;
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/recalc-staffing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: body }),
      });
      if (!res.ok) return;
      const j = (await res.json()) as { proposal?: CrmStructureProposal };
      if (j.proposal) {
        setProposal((prev) => ({
          ...j.proposal!,
          locks: prev.locks,
          assumptionItems: prev.assumptionItems ?? j.proposal!.assumptionItems,
        }));
      }
    } catch {
      // silent
    }
  }, [threadId, proposal]);

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
    setInclude: setIncludePartial,
    toggleAction,
    applyPreset,
    setAssumptions,
    resetToAi,
    loadDraft,
    clearDraft,
    recalcStaffing,
    setTaskOverride,
    setAttachmentSelection,
    setQuoteInput,
    setMilestones,
    setStagedFiles,
    setSelectedIds,
    setProposal,
  };
}
