"use client";

import { Plus } from "lucide-react";
import type { CrmStructureInstallation } from "@/modules/crm/email/email-to-crm-structure.types";
import { InstallationDataFields } from "./InstallationDataFields";

type Props = {
  installations: CrmStructureInstallation[];
  onChange: (installations: CrmStructureInstallation[]) => void;
};

const emptyInstallation = (): CrmStructureInstallation => ({
  name: "",
  address: null,
  commune: null,
  city: null,
  mapsUrl: null,
  lat: null,
  lng: null,
  coverageSlots: [],
});

export function PlanInstallationsForm({ installations, onChange }: Props) {
  function patchAt(idx: number, next: CrmStructureInstallation) {
    const copy = [...installations];
    copy[idx] = next;
    onChange(copy);
  }

  return (
    <div className="space-y-3">
      {installations.length === 0 && (
        <p className="text-[13px] text-ds-text-3">Sin instalaciones.</p>
      )}
      {installations.map((inst, i) => (
        <div
          key={i}
          className="space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2.5"
        >
          <InstallationDataFields
            installation={inst}
            index={i}
            onChange={(next) => patchAt(i, next)}
            onRemove={() => onChange(installations.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...installations, emptyInstallation()])}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
      >
        <Plus className="h-4 w-4" /> Agregar instalación
      </button>
    </div>
  );
}
