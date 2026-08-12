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
  proximoPaso: string | null;
  canEdit?: boolean;
  onUpdated?: (next: { expectedCloseDate: string | null; proximoPaso: string | null }) => void;
};

export function DealPipelineFieldsCard({
  dealId,
  expectedCloseDate,
  proximoPaso,
  canEdit = true,
  onUpdated,
}: Props) {
  const [closeDate, setCloseDate] = useState(dealCloseDateYmd(expectedCloseDate) ?? "");
  const [nextStep, setNextStep] = useState(proximoPaso ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCloseDate(dealCloseDateYmd(expectedCloseDate) ?? "");
  }, [expectedCloseDate]);

  useEffect(() => {
    setNextStep(proximoPaso ?? "");
  }, [proximoPaso]);

  async function persist(patch: { expectedCloseDate?: string | null; proximoPaso?: string | null }) {
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
      const nextStepVal = json.data?.proximoPaso ?? null;
      onUpdated?.({ expectedCloseDate: nextClose, proximoPaso: nextStepVal });
      toast.success("Pipeline actualizado");
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
    const current = (proximoPaso ?? "").trim();
    if (trimmed === current) return;
    const ok = await persist({ proximoPaso: trimmed || null });
    if (!ok) setNextStep(proximoPaso ?? "");
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">
        Cierre y próximo paso
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`deal-close-${dealId}`} className="text-[12px] text-ds-text-3">
          Fecha de cierre estimada
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
          Próximo paso
        </Label>
        {canEdit ? (
          <Input
            id={`deal-step-${dealId}`}
            value={nextStep}
            disabled={saving}
            maxLength={200}
            placeholder="Ej. Enviar propuesta revisada"
            onChange={(e) => setNextStep(e.target.value)}
            onBlur={() => void saveNextStep(nextStep)}
            className="h-10 sm:h-9"
          />
        ) : (
          <p className="inline-flex items-start gap-1.5 text-[13px] text-ds-text-1">
            <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ds-text-3" />
            {nextStep.trim() || "Sin definir"}
          </p>
        )}
      </div>
    </Surface>
  );
}
