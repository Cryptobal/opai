"use client";

import { useRef, useState } from "react";
import { HeartPulse, MapPin, Paperclip, Shirt, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { usePostulacionForm } from "./usePostulacionForm";
import { WizardProgress, type StepMeta } from "./WizardProgress";
import { WizardFooter } from "./WizardFooter";
import { WizardHeader } from "./WizardHeader";
import { WizardSuccess } from "./WizardSuccess";
import { StepRenderer } from "./StepRenderer";
import { validateStep } from "./wizard-validation";

interface PostulacionWizardProps {
  token: string;
  tenantSlug: string;
}

const STEPS: StepMeta[] = [
  { label: "Datos personales", Icon: User },
  { label: "Contacto y dirección", Icon: MapPin },
  { label: "Previsión y banco", Icon: HeartPulse },
  { label: "Tallas de uniforme", Icon: Shirt },
  { label: "Documentos", Icon: Paperclip },
];

export function PostulacionWizard({ token, tenantSlug }: PostulacionWizardProps) {
  const c = usePostulacionForm({ token, tenantSlug });
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const goNext = () => {
    const ctx = {
      healthSystem: c.healthSystem,
      isapreHasExtraPercent: c.isapreHasExtraPercent,
      uploadedDocs: c.uploadedDocs,
      documentTypes: c.documentTypes,
    };
    const { ok, errors: stepErrors } = validateStep(step, c.form, ctx);
    if (!ok) {
      setErrors(stepErrors);
      requestAnimationFrame(() => {
        const el = contentRef.current?.querySelector(".text-status-danger-fg");
        (el ?? contentRef.current)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setErrors({});
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
    scrollToTop();
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
    scrollToTop();
  };

  const goToStep = (idx: number) => {
    if (idx <= maxStep) {
      setErrors({});
      setStep(idx);
      scrollToTop();
    } else if (idx === step + 1) {
      goNext();
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <WizardHeader />
      {c.submitSuccessMessage ? (
        <WizardSuccess message={c.submitSuccessMessage} />
      ) : (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <WizardProgress steps={STEPS} step={step} maxStep={maxStep} onStepClick={goToStep} />
            <div
              ref={contentRef}
              key={step}
              className="animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none"
            >
              <StepRenderer step={step} c={c} errors={errors} />
            </div>
            <WizardFooter
              step={step}
              totalSteps={STEPS.length}
              saving={c.saving}
              onBack={goBack}
              onNext={goNext}
              onSubmit={c.handleSubmit}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
