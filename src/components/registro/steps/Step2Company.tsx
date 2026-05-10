'use client';

import { useState, useRef } from 'react';
import { step2Schema } from '@/components/registro/lib/validation';
import {
  generateSlugFromName,
  isReservedSlugClient,
  isValidSlugFormat,
  suggestSlugAlternatives,
} from '@/components/registro/lib/slug-generator';
import { RutLookupCard, type RutLookupStatus } from './shared/RutLookupCard';
import { ManualCompanyForm } from './shared/ManualCompanyForm';
import type { WizardState } from '@/components/registro/lib/wizard-state';

interface Step2CompanyProps {
  values: WizardState['step2'];
  onValuesChange: (next: WizardState['step2']) => void;
  onNext: () => void;
  onBack: () => void;
}

type FieldErrors = Partial<Record<
  'companyRut' | 'commercialName' | 'proposedSlug' | 'legalName' | 'address' | 'commune' | 'city' | 'giro',
  string
>>;

interface RutLookupData {
  razonSocial: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
}

type SlugCheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function Step2Company({ values, onValuesChange, onNext, onBack }: Step2CompanyProps) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [rutStatus, setRutStatus] = useState<RutLookupStatus>('idle');
  const [rutData, setRutData] = useState<RutLookupData | undefined>();
  const [rutErrorMsg, setRutErrorMsg] = useState<string | undefined>();
  const [showManual, setShowManual] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugCheckStatus>('idle');
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = <K extends keyof WizardState['step2']>(key: K, v: WizardState['step2'][K]) => {
    onValuesChange({ ...values, [key]: v });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const lookupRut = async () => {
    if (!values.companyRut) return;
    setRutStatus('loading');
    setRutErrorMsg(undefined);
    try {
      const res = await fetch('/api/public/signup/lookup-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: values.companyRut }),
      });
      const data = await res.json();
      if (res.status === 404) {
        setRutStatus('not_found');
        return;
      }
      if (!data.success) {
        setRutStatus('error');
        setRutErrorMsg(data.error ?? 'Error consultando SII');
        return;
      }
      setRutData(data.summary);
      setRutStatus('success');
      // Autocompletar campos de empresa con datos del SII
      const next: WizardState['step2'] = { ...values, rutLookupOk: true };
      if (data.summary.razonSocial) {
        next.legalName = data.summary.razonSocial;
        if (!values.commercialName) next.commercialName = data.summary.razonSocial;
      }
      if (data.summary.giro) next.giro = data.summary.giro;
      if (data.summary.direccion) next.address = data.summary.direccion;
      if (data.summary.comuna) next.commune = data.summary.comuna;
      if (data.summary.ciudad) next.city = data.summary.ciudad;
      // Auto-slug si está vacío
      if (!values.proposedSlug && next.commercialName) {
        next.proposedSlug = generateSlugFromName(next.commercialName);
      }
      onValuesChange(next);
      if (next.proposedSlug) checkSlugAvailability(next.proposedSlug);
    } catch (e) {
      setRutStatus('error');
      setRutErrorMsg(e instanceof Error ? e.message : 'Error de red');
    }
  };

  const checkSlugAvailability = (slug: string) => {
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);

    if (!slug || slug.length < 3) {
      setSlugStatus('idle');
      return;
    }
    if (!isValidSlugFormat(slug)) {
      setSlugStatus('invalid');
      return;
    }
    if (isReservedSlugClient(slug)) {
      setSlugStatus('taken');
      setSlugSuggestions(suggestSlugAlternatives(values.commercialName || slug));
      return;
    }

    setSlugStatus('checking');
    slugDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/signup/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (data.available) {
          setSlugStatus('available');
          setSlugSuggestions([]);
        } else {
          setSlugStatus('taken');
          setSlugSuggestions(data.suggestions ?? suggestSlugAlternatives(values.commercialName || slug));
        }
      } catch {
        setSlugStatus('idle');
      }
    }, 400);
  };

  const handleCommercialNameChange = (v: string) => {
    const next: WizardState['step2'] = { ...values, commercialName: v };
    if (!values.proposedSlug || values.proposedSlug === generateSlugFromName(values.commercialName)) {
      next.proposedSlug = generateSlugFromName(v);
      checkSlugAvailability(next.proposedSlug);
    }
    onValuesChange(next);
    setErrors((prev) => ({ ...prev, commercialName: undefined }));
  };

  const handleSlugChange = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    update('proposedSlug', cleaned);
    checkSlugAvailability(cleaned);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const parsed = step2Schema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      setSubmitting(false);
      return;
    }

    if (slugStatus === 'taken' || slugStatus === 'invalid') {
      setErrors((prev) => ({ ...prev, proposedSlug: 'Elige otro identificador disponible' }));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onNext();
  };

  return (
    <>
      <h1 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: 'var(--mk-text)' }}>
        Tu empresa
      </h1>
      <p style={{ fontSize: 14, color: 'var(--mk-muted)', margin: '0 0 24px' }}>
        Si tienes RUT lo consultamos al SII para autocompletar todo. Si no, lo llenas tú.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="registro-field">
          <label htmlFor="companyRut">RUT de la empresa <span style={{ color: 'var(--mk-muted)', fontWeight: 400 }}>(opcional)</span></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="companyRut"
              type="text"
              value={values.companyRut}
              onChange={(e) => update('companyRut', e.target.value)}
              placeholder="76.123.456-7"
              maxLength={15}
              className={errors.companyRut ? 'error' : ''}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={lookupRut}
              disabled={!values.companyRut || rutStatus === 'loading'}
              className="registro-btn registro-btn-ghost"
              style={{ padding: '12px 18px', fontSize: 13 }}
            >
              {rutStatus === 'loading' ? 'Consultando…' : 'Consultar SII'}
            </button>
          </div>
          {errors.companyRut && <span className="registro-field-error">{errors.companyRut}</span>}
          <RutLookupCard
            status={rutStatus}
            data={rutData}
            errorMsg={rutErrorMsg}
            onManualEntry={() => setShowManual(true)}
            onRetry={lookupRut}
          />
        </div>

        <div className="registro-field">
          <label htmlFor="commercialName">Nombre comercial</label>
          <input
            id="commercialName"
            type="text"
            value={values.commercialName}
            onChange={(e) => handleCommercialNameChange(e.target.value)}
            placeholder="Cómo se conoce tu empresa"
            maxLength={150}
            className={errors.commercialName ? 'error' : ''}
            required
          />
          {errors.commercialName && <span className="registro-field-error">{errors.commercialName}</span>}
        </div>

        <div className="registro-field">
          <label htmlFor="proposedSlug">Tu portal</label>
          <div className="registro-slug-wrap">
            <span className="registro-slug-prefix">https://</span>
            <input
              id="proposedSlug"
              type="text"
              value={values.proposedSlug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="tu-empresa"
              maxLength={40}
              className={`registro-slug-input ${errors.proposedSlug || slugStatus === 'taken' || slugStatus === 'invalid' ? 'error' : ''}`}
              required
            />
            <span className="registro-slug-suffix">.opai.cl</span>
          </div>
          {slugStatus === 'checking' && <span className="registro-field-hint">verificando disponibilidad…</span>}
          {slugStatus === 'available' && <span className="registro-field-hint" style={{ color: 'var(--mk-teal)' }}>✓ disponible</span>}
          {slugStatus === 'invalid' && <span className="registro-field-error">Solo minúsculas, números y guiones (3-40 caracteres)</span>}
          {slugStatus === 'taken' && (
            <div style={{ marginTop: 6 }}>
              <span className="registro-field-error">Ese identificador no está disponible</span>
              {slugSuggestions.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {slugSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSlugChange(s)}
                      style={{
                        padding: '4px 10px',
                        background: 'var(--mk-bg-card-h)',
                        border: '1px solid var(--mk-border)',
                        borderRadius: 999,
                        fontSize: 12,
                        color: 'var(--mk-text)',
                        cursor: 'pointer',
                        fontFamily: 'var(--mk-font-m)',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {errors.proposedSlug && <span className="registro-field-error">{errors.proposedSlug}</span>}
        </div>

        {(showManual || rutStatus === 'not_found' || rutStatus === 'error') && (
          <ManualCompanyForm
            values={{
              legalName: values.legalName,
              address: values.address,
              commune: values.commune,
              city: values.city,
              giro: values.giro,
            }}
            onChange={(field, v) => update(field, v)}
            errors={{
              legalName: errors.legalName,
              address: errors.address,
              commune: errors.commune,
              city: errors.city,
              giro: errors.giro,
            }}
          />
        )}

        <div className="registro-actions">
          <button type="button" onClick={onBack} className="registro-btn registro-btn-ghost">
            &larr; Atrás
          </button>
          <button type="submit" className="registro-btn registro-btn-primary" disabled={submitting}>
            Continuar &rarr;
          </button>
        </div>
      </form>
    </>
  );
}
