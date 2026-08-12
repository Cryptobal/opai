"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { Surface } from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dealCloseDateYmd } from "@/components/crm/deals/deals-helpers";

type Props = {
  dealId: string;
  expectedCloseDate: string | null;
  nextStep: string | null;
  canEdit?: boolean;
  onUpdated?: (next: { expectedCloseDate: string | null; nextStep: string | null }) => void;
};

export function DealPipelineFieldsCard({
  dealId,
  expectedCloseDate,
  nextStep,
  canEdit = true,
  onUpdated,
}: Props) {
  const [closeDate, setCloseDate] = useState(dealCloseDateYmd(expectedCloseDate) ?? "");
  const [nextStepDraft, setNextStepDraft] = useState(nextStep ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCloseDate(dealCloseDateYmd(expectedCloseDate) ?? "");
  }, [expectedCloseDate]);

  useEffect(() => {
    setNextStepDraft(nextStep ?? "");
  }, [nextStep]);

  async function persist(patch: { expectedCloseDate?: string | null; nextStep?: string | null }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo guardar");
        return false;
      }
      const nextClose =
        json.data?.expectedCloseDate != null
          ? String(json.data.expectedCloseDate)
          : null;
      const nextStepVal = json.data?.nextStep ?? null;
      onUpdated?.({ expectedCloseDate: nextClose, nextStep: nextStepVal });
      toast.success("Negocio actualizado");
      return true;
    } catch {
      toast.error("No se pudo guardar");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveCloseDate(value: string) {
    const ymd = value.trim();
    const current = dealCloseDateYmd(expectedCloseDate);
    if (ymd === (current ?? "")) return;
    const ok = await persist({ expectedCloseDate: ymd || null });
    if (!ok) setCloseDate(current ?? "");
  }

  async function saveNextStep(value: string) {
    const trimmed = value.trim();
    const current = (nextStep ?? "").trim();
    if (trimmed === current) return;
    const ok = await persist({ nextStep: trimmed || null });
    if (!ok) setNextStepDraft(nextStep ?? "");
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
        Pipeline comercial
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`deal-close-${dealId}`} className="text-[12px] text-ds-text-3">
          Cierre estimado
        </Label>
        {canEdit ? (
          <Input
            id={`deal-close-${dealId}`}
            type="date"
            value={closeDate}
            disabled={saving}
            onChange={(e) => setCloseDate(e.target.value)}
            onBlur={() => void saveCloseDate(closeDate)}
            className="h-10 sm:h-9"
          />
        ) : (
          <p className="inline-flex items-center gap-1.5 text-[13px] text-ds-text-1">
            <CalendarClock className="h-3.5 w-3.5 text-ds-text-3" />
            {closeDate || "Sin fecha"}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`deal-step-${dealId}`} className="text-[12px] text-ds-text-3">
          Próxima acción
        </Label>
        {canEdit ? (
          <Input
            id={`deal-step-${dealId}`}
            value={nextStepDraft}
            disabled={saving}
            maxLength={200}
            placeholder="Ej. Enviar propuesta revisada"
            onChange={(e) => setNextStepDraft(e.target.value)}
            onBlur={() => void saveNextStep(nextStepDraft)}
            className="h-10 sm:h-9"
          />
        ) : (
          <p className="inline-flex items-start gap-1.5 text-[13px] text-ds-text-1">
            <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ds-text-3" />
            {nextStepDraft.trim() || "Sin definir"}
          </p>
        )}
      </div>
    </Surface>
  );
}
