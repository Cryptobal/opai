'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { WizardStepper } from '@/components/registro/WizardStepper';
import { PreviewPanel } from '@/components/registro/PreviewPanel';
import { Step1Account } from '@/components/registro/steps/Step1Account';
import { Step2Company } from '@/components/registro/steps/Step2Company';
import { Step3Review } from '@/components/registro/steps/Step3Review';
import {
  initialWizardState,
  loadWizardState,
  saveWizardState,
  clearWizardState,
  captureUtmFromQuery,
  type WizardState,
} from '@/components/registro/lib/wizard-state';

export default function RegistroWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<WizardState>(initialWizardState);
  // Password vive solo en memoria — nunca se persiste a localStorage
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>();

  // Hidratar de localStorage + query params en mount
  useEffect(() => {
    const stored = loadWizardState();
    const utm = captureUtmFromQuery();
    const emailFromQuery = searchParams.get('email');

    let next: WizardState = stored ?? initialWizardState;
    next = { ...next, utm: { ...next.utm, ...utm } };
    if (emailFromQuery && !next.step1.email) {
      next = { ...next, step1: { ...next.step1, email: emailFromQuery } };
    }

    setState(next);
    setHydrated(true);
  }, [searchParams]);

  // Persistir cambios (sin password)
  useEffect(() => {
    if (!hydrated) return;
    saveWizardState(state);
  }, [state, hydrated]);

  const goToStep = (step: 1 | 2 | 3) => {
    setState((prev) => ({ ...prev, step }));
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (turnstileToken: string, honeypot: string) => {
    setSubmitError(undefined);

    const payload = {
      email: state.step1.email,
      password,
      ownerName: state.step1.ownerName,
      ownerPhone: state.step1.ownerPhone || undefined,
      companyRut: state.step2.companyRut || undefined,
      legalName: state.step2.legalName || undefined,
      commercialName: state.step2.commercialName,
      proposedSlug: state.step2.proposedSlug,
      industry: state.step3.industry || undefined,
      estimatedGuards: state.step3.estimatedGuards || undefined,
      address: state.step2.address || undefined,
      commune: state.step2.commune || undefined,
      city: state.step2.city || undefined,
      giro: state.step2.giro || undefined,
      source: state.step3.source || 'web',
      utmSource: state.utm.source,
      utmCampaign: state.utm.campaign,
      utmMedium: state.utm.medium,
      honeypot,
      turnstileToken,
      acceptTerms: state.step1.acceptTerms,
    };

    try {
      const res = await fetch('/api/public/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.action === 'resend') {
          router.push(`/registro/verificar-email?email=${encodeURIComponent(state.step1.email)}&pending=1`);
          return;
        }
        setSubmitError(data.error ?? 'No pudimos crear tu cuenta. Intenta de nuevo.');
        return;
      }

      // Éxito — limpiar state y mandar a verificar-email
      clearWizardState();
      router.push(`/registro/verificar-email?email=${encodeURIComponent(state.step1.email)}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error de red. Reintenta.');
    }
  };

  if (!hydrated) {
    return (
      <div className="registro-shell">
        <div className="registro-grid">
          <div className="registro-form-panel" style={{ minHeight: 400 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="registro-shell">
      <div className="registro-grid">
        <div className="registro-form-panel">
          <WizardStepper current={state.step} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={state.step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {state.step === 1 && (
                <Step1Account
                  values={state.step1}
                  password={password}
                  onValuesChange={(v) => setState((s) => ({ ...s, step1: v }))}
                  onPasswordChange={setPassword}
                  onNext={() => goToStep(2)}
                />
              )}
              {state.step === 2 && (
                <Step2Company
                  values={state.step2}
                  onValuesChange={(v) => setState((s) => ({ ...s, step2: v }))}
                  onNext={() => goToStep(3)}
                  onBack={() => goToStep(1)}
                />
              )}
              {state.step === 3 && (
                <Step3Review
                  values={state.step3}
                  fullState={state}
                  onValuesChange={(v) => setState((s) => ({ ...s, step3: v }))}
                  onSubmit={handleSubmit}
                  onBack={() => goToStep(2)}
                  submitError={submitError}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <PreviewPanel state={state} />
      </div>
    </div>
  );
}
