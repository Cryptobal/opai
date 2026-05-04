"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ValidationsPanel } from "./ValidationsPanel";
import { PlatformConfigPanel } from "./PlatformConfigPanel";
import { StepEditor } from "./StepEditor";
import { AddCustomTicketForm } from "./AddCustomTicketForm";
import type { OnboardingStepDraft, PreviewData } from "./types";

const TICKET_TYPE_OPTIONS = [
  { slug: "onboarding_contrato_cliente", name: "Contrato cliente firmado" },
  {
    slug: "onboarding_informe_vulnerabilidad",
    name: "Informe de Vulnerabilidad",
  },
  {
    slug: "onboarding_directiva_funcionamiento",
    name: "Directiva de Funcionamiento (OS-10)",
  },
  { slug: "onboarding_protocolos_puesto", name: "Protocolos del puesto" },
  { slug: "onboarding_test_conocimiento", name: "Test de conocimiento" },
  {
    slug: "onboarding_uniforme_equipamiento",
    name: "Uniforme y equipamiento",
  },
];

export function OnboardingClientModal({
  open,
  dealId,
  onClose,
  onCreated,
}: {
  open: boolean;
  dealId: string;
  defaultPlaybookId?: string;
  onClose: () => void;
  onCreated: (onboardingId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [serviceStartDate, setServiceStartDate] = useState<string>("");
  const [steps, setSteps] = useState<OnboardingStepDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/onboarding/preview?dealId=${dealId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const data = j.data as PreviewData;
        setPreview(data);
        const sd = data.serviceStartDate
          ? new Date(data.serviceStartDate).toISOString().slice(0, 10)
          : "";
        setServiceStartDate(sd);
        const playbookSteps = data.defaultPlaybook?.steps ?? [];
        setSteps(
          playbookSteps.map((s) => ({
            key: s.id,
            playbookStepId: s.id,
            isCustom: false,
            applies: s.defaultApplies,
            title: s.title,
            description: s.description ?? undefined,
            ticketTypeSlug: s.ticketTypeSlug,
            assignedTeam: s.defaultAssignedTeam,
            assignedToUserId: s.defaultAssignedUserId ?? null,
            priority: s.defaultPriority,
            dueDateOffsetDays: s.dueDateOffsetDays,
            phase: s.phase,
            sortOrder: s.sortOrder,
          })),
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, dealId]);

  const updateStep = (next: OnboardingStepDraft) => {
    setSteps((prev) => prev.map((s) => (s.key === next.key ? next : s)));
  };
  const addCustomStep = (s: OnboardingStepDraft) => setSteps((prev) => [...prev, s]);
  const removeStep = (key: string) =>
    setSteps((prev) => prev.filter((s) => s.key !== key));

  const validations = preview?.validations;
  const validationsBlock = validations
    ? validations.osTenant === "red" ||
      validations.installationLinked === "red" ||
      !serviceStartDate
    : true;
  const appliedCount = steps.filter((s) => s.applies).length;

  const submit = async () => {
    if (!preview?.defaultPlaybook) return;
    if (!serviceStartDate) {
      toast.error("Falta la fecha de inicio del servicio.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          playbookId: preview.defaultPlaybook.id,
          serviceStartDate,
          steps: steps.map((s) => ({
            playbookStepId: s.playbookStepId,
            isCustom: s.isCustom,
            applies: s.applies,
            title: s.title,
            description: s.description,
            ticketTypeSlug: s.ticketTypeSlug,
            assignedTeam: s.assignedTeam,
            assignedToUserId: s.assignedToUserId ?? undefined,
            priority: s.priority,
            dueDateOffsetDays: s.dueDateOffsetDays,
            saveToPlaybook: s.saveToPlaybook,
            phase: s.phase,
            sortOrder: s.sortOrder,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error ?? "Error iniciando onboarding");
      }
      toast.success(`Onboarding creado con ${json.data.ticketIds.length} tickets.`);
      onCreated(json.data.onboardingId);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboarding del cliente</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {preview?.account?.name ?? ""}
            {preview?.installation?.name ? ` · ${preview.installation.name}` : ""}
          </p>
        </DialogHeader>

        {loading || !preview ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <ValidationsPanel validations={preview.validations} />

            {!serviceStartDate ? (
              <div className="space-y-1">
                <Label className="text-sm">Fecha de inicio de servicio</Label>
                <Input
                  type="date"
                  value={serviceStartDate}
                  onChange={(e) => setServiceStartDate(e.target.value)}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Tickets a crear</h4>
              {steps.map((s) => (
                <StepEditor
                  key={s.key}
                  step={s}
                  serviceStartDate={serviceStartDate || null}
                  onChange={updateStep}
                  onRemove={s.isCustom ? () => removeStep(s.key) : undefined}
                />
              ))}
              <AddCustomTicketForm
                onAdd={addCustomStep}
                ticketTypeOptions={TICKET_TYPE_OPTIONS}
              />
            </div>

            <PlatformConfigPanel
              status={preview.platformConfigStatus}
              installationId={preview.installation?.id ?? null}
            />

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Configuro después
              </Button>
              <Button
                onClick={submit}
                disabled={submitting || validationsBlock || appliedCount === 0}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando…
                  </>
                ) : (
                  `Crear ${appliedCount} tickets →`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
