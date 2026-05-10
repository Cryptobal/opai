'use client';

import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { step1Schema } from '@/components/registro/lib/validation';
import { PasswordStrength } from './shared/PasswordStrength';
import { EmailExistsModal } from './shared/EmailExistsModal';
import type { WizardState } from '@/components/registro/lib/wizard-state';

interface Step1AccountProps {
  values: WizardState['step1'];
  password: string;
  onValuesChange: (next: WizardState['step1']) => void;
  onPasswordChange: (next: string) => void;
  onNext: () => void;
}

type FieldErrors = Partial<Record<'email' | 'password' | 'ownerName' | 'ownerPhone' | 'acceptTerms', string>>;

export function Step1Account({
  values,
  password,
  onValuesChange,
  onPasswordChange,
  onNext,
}: Step1AccountProps) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = <K extends keyof WizardState['step1']>(key: K, v: WizardState['step1'][K]) => {
    onValuesChange({ ...values, [key]: v });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Check async de email cuando termina de escribir
  useEffect(() => {
    if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
    if (!values.email || !/.+@.+\..+/.test(values.email)) return;

    emailDebounceRef.current = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const res = await fetch('/api/public/signup/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: values.email }),
        });
        const data = await res.json();
        if (data.available === false) {
          if (data.reason === 'exists') {
            setEmailModalOpen(true);
          } else if (data.reason === 'disposable') {
            setErrors((prev) => ({ ...prev, email: data.message ?? 'Email no permitido' }));
          } else if (data.reason === 'pending') {
            setErrors((prev) => ({ ...prev, email: data.message ?? 'Ya iniciaste un registro con este email' }));
          }
        }
      } catch {
        // silencioso — el server validará en submit
      } finally {
        setEmailChecking(false);
      }
    }, 500);

    return () => {
      if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
    };
  }, [values.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const parsed = step1Schema.safeParse({ ...values, password });
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

    setSubmitting(false);
    onNext();
  };

  return (
    <>
      <h1 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: 'var(--mk-text)' }}>
        Crea tu cuenta
      </h1>
      <p style={{ fontSize: 14, color: 'var(--mk-muted)', margin: '0 0 24px' }}>
        Solo lo esencial. Te tomará menos de 30 segundos.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="registro-field">
          <label htmlFor="ownerName">Tu nombre completo</label>
          <input
            id="ownerName"
            type="text"
            autoComplete="name"
            value={values.ownerName}
            onChange={(e) => update('ownerName', e.target.value)}
            maxLength={150}
            placeholder="Ej. María Pérez"
            className={errors.ownerName ? 'error' : ''}
            required
          />
          {errors.ownerName && <span className="registro-field-error">{errors.ownerName}</span>}
        </div>

        <div className="registro-field">
          <label htmlFor="email">
            Email corporativo
            {emailChecking && <span style={{ fontSize: 11, color: 'var(--mk-muted)', marginLeft: 8 }}>verificando…</span>}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            maxLength={200}
            placeholder="tu@empresa.cl"
            className={errors.email ? 'error' : ''}
            required
          />
          {errors.email && <span className="registro-field-error">{errors.email}</span>}
        </div>

        <div className="registro-field">
          <label htmlFor="password">Contraseña</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              maxLength={200}
              placeholder="Mínimo 10 caracteres con letras y números"
              className={errors.password ? 'error' : ''}
              style={{ paddingRight: 44 }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--mk-muted)',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <span className="registro-field-error">{errors.password}</span>}
          <PasswordStrength password={password} />
        </div>

        <div className="registro-field">
          <label htmlFor="ownerPhone">Teléfono / WhatsApp <span style={{ color: 'var(--mk-muted)', fontWeight: 400 }}>(opcional)</span></label>
          <input
            id="ownerPhone"
            type="tel"
            autoComplete="tel"
            value={values.ownerPhone}
            onChange={(e) => update('ownerPhone', e.target.value)}
            maxLength={30}
            placeholder="+56 9 1234 5678"
            className={errors.ownerPhone ? 'error' : ''}
          />
          {errors.ownerPhone && <span className="registro-field-error">{errors.ownerPhone}</span>}
        </div>

        <div className="registro-field" style={{ marginTop: 20 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, color: 'var(--mk-text)' }}>
            <input
              type="checkbox"
              checked={values.acceptTerms}
              onChange={(e) => update('acceptTerms', e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 2 }}
            />
            <span>
              Acepto los{' '}
              <a href="/terminos" target="_blank" style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}>términos de servicio</a>
              {' '}y la{' '}
              <a href="/privacidad" target="_blank" style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}>política de privacidad</a>.
            </span>
          </label>
          {errors.acceptTerms && <span className="registro-field-error">{errors.acceptTerms}</span>}
        </div>

        <div className="registro-actions">
          <span />
          <button type="submit" className="registro-btn registro-btn-primary" disabled={submitting}>
            Continuar &rarr;
          </button>
        </div>
      </form>

      <EmailExistsModal
        open={emailModalOpen}
        email={values.email}
        onClose={() => setEmailModalOpen(false)}
      />
    </>
  );
}
