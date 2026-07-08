"use client";

import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WizardFooterProps {
  step: number;
  totalSteps: number;
  saving: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export function WizardFooter({ step, totalSteps, saving, onBack, onNext, onSubmit }: WizardFooterProps) {
  const isLast = step === totalSteps - 1;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            onClick={onBack}
            aria-label="Volver al paso anterior"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : null}
        {isLast ? (
          <Button type="button" className="h-12 flex-1 text-base" disabled={saving} onClick={onSubmit}>
            <Send className="mr-2 h-5 w-5" />
            {saving ? "Enviando..." : "Enviar postulación"}
          </Button>
        ) : (
          <Button type="button" className="h-12 flex-1 text-base" onClick={onNext}>
            Siguiente
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
