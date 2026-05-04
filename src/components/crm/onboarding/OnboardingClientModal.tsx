"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, Building2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ValidationsPanel } from "./ValidationsPanel";
import { PlatformConfigPanel } from "./PlatformConfigPanel";
import { StepEditor } from "./StepEditor";
import { AddCustomTicketForm } from "./AddCustomTicketForm";
import { OnboardingSuccessShare } from "./OnboardingSuccessShare";
import {
  buildOnboardingTicketsFromSteps,
  buildOnboardingWhatsAppMessage,
  type CreatedTicketSummary,
  type QuotePosition,
} from "./whatsapp-summary";
import type { OnboardingStepDraft, PreviewData } from "./types";
import { cn } from "@/lib/utils";

const TICKET_TYPE_OPTIONS = [
  { slug: "onboarding_contrato_cliente", name: "Contrato cliente firmado" },
  { slug: "onboarding_informe_vulnerabilidad", name: "Informe de Vulnerabilidad" },
  { slug: "onboarding_directiva_funcionamiento", name: "Directiva de Funcionamiento (OS-10)" },
  { slug: "onboarding_protocolos_puesto", name: "Protocolos del puesto" },
  { slug: "onboarding_test_conocimiento", name: "Test de conocimiento" },
  { slug: "onboarding_uniforme_equipamiento", name: "Uniforme y equipamiento" },
];

type Stage = "form" | "share";

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

  // Stage transitions
  const [stage, setStage] = useState<Stage>("form");
  const [createdSummary, setCreatedSummary] = useState<{
    onboardingId: string;
    ticketIds: string[];
    tickets: CreatedTicketSummary[];
    positions: QuotePosition[];
    message: string;
    mapsUrl: string | null;
    dealUrl: string;
    ticketsUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setStage("form");
    setCreatedSummary(null);
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
  const addCustomStep = (s: OnboardingStepDraft) =>
    setSteps((prev) => [...prev, s]);
  const removeStep = (key: string) =>
    setSteps((prev) => prev.filter((s) => s.key !== key));

  const validations = preview?.validations;
  const validationsBlock = validations
    ? validations.osTenant === "red" ||
      validations.installationLinked === "red" ||
      !serviceStartDate
    : true;
  const appliedCount = steps.filter((s) => s.applies).length;

  const validationFailures = useMemo(() => {
    if (!validations) return [] as string[];
    const out: string[] = [];
    if (validations.osTenant === "red") out.push("OS-10 del tenant vencido");
    if (validations.installationLinked === "red")
      out.push("Sin sitio vinculado al deal");
    if (!serviceStartDate) out.push("Falta fecha de inicio");
    return out;
  }, [validations, serviceStartDate]);

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

      // Build the share message
      const tickets = buildOnboardingTicketsFromSteps(steps, serviceStartDate);

      // Best-effort fetch of positions for the WhatsApp message
      let positions: QuotePosition[] = [];
      const quoteId = preview.deal.activeQuotationId;
      if (quoteId) {
        try {
          const qRes = await fetch(`/api/cpq/quotes/${quoteId}`);
          const qJson = await qRes.json();
          if (qJson?.success && Array.isArray(qJson.data?.positions)) {
            positions = qJson.data.positions as QuotePosition[];
          }
        } catch {
          /* ignore — message still works without positions */
        }
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const dealUrl = `${origin}/crm/deals/${dealId}`;
      const ticketsUrl = `${origin}/ops/tickets?dealId=${dealId}`;
      const hasCoords =
        preview.installation &&
        typeof preview.installation.lat === "number" &&
        typeof preview.installation.lng === "number";
      const mapsUrl = hasCoords
        ? `https://maps.google.com/?q=${preview.installation!.lat},${preview.installation!.lng}`
        : null;

      const message = buildOnboardingWhatsAppMessage({
        preview,
        serviceStartDate,
        tickets,
        positions,
        dealUrl,
        ticketsUrl,
      });

      setCreatedSummary({
        onboardingId: json.data.onboardingId,
        ticketIds: json.data.ticketIds,
        tickets,
        positions,
        message,
        mapsUrl,
        dealUrl,
        ticketsUrl,
      });

      toast.success(
        `Onboarding creado con ${json.data.ticketIds.length} tickets.`,
      );
      onCreated(json.data.onboardingId);
      setStage("share");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 sm:rounded-2xl">
        <ModalHeader
          stage={stage}
          accountName={preview?.account?.name ?? ""}
          installationName={preview?.installation?.name ?? null}
        />

        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {loading || !preview ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-ds-text-3" />
            </div>
          ) : stage === "share" && createdSummary ? (
            <OnboardingSuccessShare
              ticketCount={createdSummary.ticketIds.length}
              message={createdSummary.message}
              dealUrl={createdSummary.dealUrl}
              ticketsUrl={createdSummary.ticketsUrl}
              hasMaps={!!createdSummary.mapsUrl}
              mapsUrl={createdSummary.mapsUrl}
              recipientPhone={preview.primaryContact?.phone ?? null}
              tickets={createdSummary.tickets}
              onClose={onClose}
            />
          ) : (
            <div className="space-y-4">
              <ValidationsPanel validations={preview.validations} />

              {!serviceStartDate ? (
                <div className="space-y-1.5 rounded-xl border border-status-warn/40 bg-status-warn/[0.06] p-3.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-status-warn-fg">
                    <Calendar className="h-3.5 w-3.5" />
                    Fecha de inicio del servicio
                  </label>
                  <Input
                    type="date"
                    value={serviceStartDate}
                    onChange={(e) => setServiceStartDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              ) : null}

              <section className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ds-text-3">
                    Tickets a crear
                  </h3>
                  <span className="text-[11px] tabular-nums text-ds-text-3">
                    {appliedCount} activo{appliedCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {steps.map((s) => (
                    <StepEditor
                      key={s.key}
                      step={s}
                      serviceStartDate={serviceStartDate || null}
                      onChange={updateStep}
                      onRemove={
                        s.isCustom ? () => removeStep(s.key) : undefined
                      }
                    />
                  ))}
                </div>
                <AddCustomTicketForm
                  onAdd={addCustomStep}
                  ticketTypeOptions={TICKET_TYPE_OPTIONS}
                />
              </section>

              <PlatformConfigPanel
                status={preview.platformConfigStatus}
                installationId={preview.installation?.id ?? null}
              />

              {validationFailures.length > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-status-danger/30 bg-status-danger/[0.06] p-3 text-xs text-status-danger-fg">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    No puedes crear el onboarding hasta resolver:{" "}
                    {validationFailures.join(", ")}.
                  </span>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  variant="ghost"
                  onClick={onClose}
                  disabled={submitting}
                  className="text-ds-text-3 hover:text-ds-text-1"
                >
                  Configuro después
                </Button>
                <Button
                  onClick={submit}
                  disabled={
                    submitting || validationsBlock || appliedCount === 0
                  }
                  className={cn(
                    "min-w-[160px] gap-1.5",
                    !validationsBlock && appliedCount > 0 && "shadow-md",
                  )}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creando…
                    </>
                  ) : (
                    `Crear ${appliedCount} ticket${appliedCount === 1 ? "" : "s"}`
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModalHeader({
  stage,
  accountName,
  installationName,
}: {
  stage: Stage;
  accountName: string;
  installationName: string | null;
}) {
  const subtitle = [accountName, installationName].filter(Boolean).join(" · ");
  const title = stage === "share" ? "¡Listo! Compartir resumen" : "Onboarding del cliente";

  return (
    <DialogHeader className="space-y-2 border-b border-ds-border-default/60 px-5 pb-4 pt-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            stage === "share"
              ? "bg-status-ok/15 text-status-ok-fg"
              : "bg-primary/10 text-primary",
          )}
          aria-hidden
        >
          <Building2 className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <DialogTitle className="text-lg leading-tight">{title}</DialogTitle>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-ds-text-3">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {/* Stepper indicator */}
      <div
        className="flex items-center gap-1.5 pt-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={2}
        aria-valuenow={stage === "share" ? 2 : 1}
      >
        <span
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            "bg-primary",
          )}
        />
        <span
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            stage === "share" ? "bg-status-ok" : "bg-ds-border-default",
          )}
        />
      </div>
    </DialogHeader>
  );
}
