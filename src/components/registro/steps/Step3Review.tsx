'use client';

import { useState } from 'react';
import { TurnstileWidget } from '@/components/registro/TurnstileWidget';
import type { WizardState } from '@/components/registro/lib/wizard-state';

const INDUSTRIES = [
  { value: '', label: 'Selecciona una industria…' },
  { value: 'seguridad-fisica', label: 'Seguridad física / Guardias' },
  { value: 'seguridad-electronica', label: 'Seguridad electrónica / Monitoreo' },
  { value: 'transporte-valores', label: 'Transporte de valores' },
  { value: 'investigacion', label: 'Investigación privada' },
  { value: 'consultoria', label: 'Consultoría en seguridad' },
  { value: 'otro', label: 'Otro' },
];

const GUARD_RANGES: Array<{ value: WizardState['step3']['estimatedGuards']; label: string }> = [
  { value: '1-5', label: '1 — 5 guardias' },
  { value: '6-15', label: '6 — 15 guardias' },
  { value: '16-30', label: '16 — 30 guardias' },
  { value: '31-100', label: '31 — 100 guardias' },
  { value: '101-300', label: '101 — 300 guardias' },
  { value: '300+', label: '300+ guardias' },
];

const SOURCES = [
  { value: '', label: '¿Cómo nos conociste? (opcional)' },
  { value: 'google', label: 'Búsqueda en Google' },
  { value: 'recomendacion', label: 'Recomendación / boca a boca' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram / Facebook' },
  { value: 'evento', label: 'Evento o conferencia' },
  { value: 'otro', label: 'Otro' },
];

interface Step3ReviewProps {
  values: WizardState['step3'];
  fullState: WizardState;
  onValuesChange: (next: WizardState['step3']) => void;
  onSubmit: (turnstileToken: string, honeypot: string) => Promise<void>;
  onBack: () => void;
  submitError?: string;
}

export function Step3Review({
  values,
  fullState,
  onValuesChange,
  onSubmit,
  onBack,
  submitError,
}: Step3ReviewProps) {
  const [turnstileToken, setTurnstileToken] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof WizardState['step3']>(key: K, v: WizardState['step3'][K]) => {
    onValuesChange({ ...values, [key]: v });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) return;
    setSubmitting(true);
    try {
      await onSubmit(turnstileToken, honeypot);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: 'var(--mk-text)' }}>
        Casi listo
      </h1>
      <p style={{ fontSize: 14, color: 'var(--mk-muted)', margin: '0 0 24px' }}>
        Confirma los detalles y empezamos a crear tu cuenta.
      </p>

      {/* Resumen */}
      <div className="mk-card" style={{ padding: 16, marginBottom: 24, background: 'var(--mk-bg)' }}>
        <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 14, fontWeight: 700, color: 'var(--mk-text)', margin: '0 0 12px' }}>
          Resumen
        </h3>
        <dl style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <dt style={{ color: 'var(--mk-muted)' }}>Cuenta</dt>
            <dd style={{ margin: 0, color: 'var(--mk-text)', textAlign: 'right' }}>{fullState.step1.email}</dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <dt style={{ color: 'var(--mk-muted)' }}>Empresa</dt>
            <dd style={{ margin: 0, color: 'var(--mk-text)', textAlign: 'right' }}>{fullState.step2.commercialName}</dd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <dt style={{ color: 'var(--mk-muted)' }}>Portal</dt>
            <dd style={{ margin: 0, color: 'var(--mk-teal)', textAlign: 'right', fontFamily: 'var(--mk-font-m)' }}>
              {fullState.step2.proposedSlug}.opai.cl
            </dd>
          </div>
        </dl>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="registro-field">
          <label htmlFor="industry">Industria</label>
          <select
            id="industry"
            value={values.industry}
            onChange={(e) => update('industry', e.target.value)}
          >
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>

        <div className="registro-field">
          <label>Tamaño actual</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {GUARD_RANGES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => update('estimatedGuards', g.value)}
                style={{
                  padding: '10px 8px',
                  background: values.estimatedGuards === g.value ? 'var(--mk-teal-dim)' : 'var(--mk-bg)',
                  border: `1px solid ${values.estimatedGuards === g.value ? 'var(--mk-teal)' : 'var(--mk-border)'}`,
                  borderRadius: 8,
                  color: values.estimatedGuards === g.value ? 'var(--mk-teal)' : 'var(--mk-text)',
                  fontSize: 13,
                  fontWeight: values.estimatedGuards === g.value ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="registro-field">
          <label htmlFor="source">¿Cómo llegaste a Opai?</label>
          <select
            id="source"
            value={values.source}
            onChange={(e) => update('source', e.target.value)}
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Honeypot — invisible para humanos, bots lo llenan */}
        <input
          type="text"
          name="company_website"
          autoComplete="off"
          tabIndex={-1}
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          className="registro-hp"
          aria-hidden="true"
        />

        <div className="registro-field" style={{ marginTop: 24 }}>
          <TurnstileWidget onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} />
        </div>

        {submitError && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--mk-text)',
              fontSize: 13,
              marginTop: 12,
            }}
          >
            {submitError}
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--mk-muted)', margin: '20px 0 0', lineHeight: 1.5, textAlign: 'center' }}>
          Te enviaremos un email para confirmar tu cuenta. Sin tarjeta de crédito.
        </p>

        <div className="registro-actions">
          <button type="button" onClick={onBack} className="registro-btn registro-btn-ghost" disabled={submitting}>
            &larr; Atrás
          </button>
          <button
            type="submit"
            className="registro-btn registro-btn-primary"
            disabled={submitting || !turnstileToken}
          >
            {submitting ? 'Creando cuenta…' : 'Crear mi cuenta gratis'}
          </button>
        </div>
      </form>
    </>
  );
}
