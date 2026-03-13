"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock,
  ArrowRightLeft,
  AlertTriangle,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";

export interface FollowUpDecision {
  includeFollowUp: boolean;
  targetStageId: string | null;
  sendWhatsApp?: boolean;
}

interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
}

// ── Inline content (embeddable inside existing Dialogs) ──

interface FollowUpDecisionContentProps {
  dealId: string;
  onConfirm: (decision: FollowUpDecision) => void;
  onCancel: () => void;
  loading?: boolean;
  showWhatsApp?: boolean;
}

export function FollowUpDecisionContent({
  dealId,
  onConfirm,
  onCancel,
  loading,
  showWhatsApp = false,
}: FollowUpDecisionContentProps) {
  const [choice, setChoice] = useState<"yes" | "no">("yes");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!dealId) return;
    setLoadingData(true);
    Promise.all([
      fetch("/api/crm/pipeline").then((r) => r.json()),
      fetch(`/api/crm/deals/${dealId}/followup-status`).then((r) => r.json()),
    ])
      .then(([pipelineRes, statusRes]) => {
        if (pipelineRes.success !== false) {
          const allStages: PipelineStage[] = pipelineRes.data || pipelineRes;
          const openStages = allStages.filter(
            (s) => !s.isClosedWon && !s.isClosedLost
          );
          setStages(openStages);
          if (openStages.length > 0 && !selectedStageId) {
            setSelectedStageId(openStages[0].id);
          }
        }
        if (statusRes.success) {
          setPendingCount(statusRes.data.pendingCount);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingData(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const buildDecision = (sendWhatsApp: boolean): FollowUpDecision => ({
    includeFollowUp: choice === "yes",
    targetStageId: choice === "no" ? selectedStageId || null : null,
    sendWhatsApp,
  });

  const isDisabled = loading || (choice === "no" && !selectedStageId);

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ¿Incluir este negocio en el flujo de seguimiento automático?
      </p>

      {/* Choice buttons */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setChoice("yes")}
          className={`w-full rounded-lg border p-3 text-left text-sm transition-colors flex items-center gap-3 ${
            choice === "yes"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card hover:bg-accent/30"
          }`}
        >
          <CalendarClock className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Sí, incluir seguimiento</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Se programarán emails automáticos y el negocio pasará a
              &quot;Cotización enviada&quot;
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setChoice("no")}
          className={`w-full rounded-lg border p-3 text-left text-sm transition-colors flex items-center gap-3 ${
            choice === "no"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card hover:bg-accent/30"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">No, mover a otra etapa</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sin seguimiento automático, elige la etapa del negocio
            </p>
          </div>
        </button>
      </div>

      {/* Stage selector (only when "no") */}
      {choice === "no" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">
            Mover negocio a:
          </label>
          <Select value={selectedStageId} onValueChange={setSelectedStageId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona etapa" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <span className="flex items-center gap-2">
                    {stage.color && (
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                    )}
                    {stage.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {pendingCount > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Se cancelarán {pendingCount} seguimiento
                {pendingCount > 1 ? "s" : ""} pendiente
                {pendingCount > 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2">
        {showWhatsApp ? (
          <>
            {/* Primary: email + WhatsApp */}
            <Button
              onClick={() => onConfirm(buildDecision(true))}
              disabled={isDisabled}
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-11"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              {loading ? "Enviando..." : "Enviar + abrir WhatsApp"}
            </Button>
            {/* Secondary: email only */}
            <Button
              variant="outline"
              onClick={() => onConfirm(buildDecision(false))}
              disabled={isDisabled}
              className="w-full gap-2"
            >
              <Send className="h-4 w-4" />
              Solo enviar por email
            </Button>
          </>
        ) : (
          <Button
            onClick={() => onConfirm(buildDecision(false))}
            disabled={isDisabled}
            className="w-full gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Confirmar y enviar"
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={onCancel}
          className="w-full text-muted-foreground text-xs h-8"
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── Standalone modal (for Portal flow) ──

interface FollowUpDecisionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  onConfirm: (decision: FollowUpDecision) => void;
  loading?: boolean;
  showWhatsApp?: boolean;
}

export function FollowUpDecisionModal({
  open,
  onOpenChange,
  dealId,
  onConfirm,
  loading,
  showWhatsApp = false,
}: FollowUpDecisionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Opciones de seguimiento</DialogTitle>
          <DialogDescription>
            Configura el seguimiento antes de enviar
          </DialogDescription>
        </DialogHeader>
        <FollowUpDecisionContent
          dealId={dealId}
          onConfirm={onConfirm}
          onCancel={() => onOpenChange(false)}
          loading={loading}
          showWhatsApp={showWhatsApp}
        />
      </DialogContent>
    </Dialog>
  );
}
