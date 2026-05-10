'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, RefreshCw, CheckCircle2 } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerificarEmailClient() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const isPending = searchParams.get('pending') === '1';

  const [cooldown, setCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email || cooldown > 0 || resendStatus === 'sending') return;
    setResendStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/public/signup/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendStatus('error');
        setErrorMsg(data.error ?? 'No pudimos reenviar el email. Intenta de nuevo.');
        return;
      }
      setResendStatus('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setResendStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Error de red');
    }
  };

  return (
    <main style={{ padding: '80px 16px 80px', display: 'flex', justifyContent: 'center' }}>
      <div className="mk-card" style={{ maxWidth: 520, width: '100%', padding: 40, textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--mk-teal-dim)',
            border: '1px solid var(--mk-teal-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <Mail size={28} color="var(--mk-teal)" />
        </div>

        <h1
          style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--mk-text)',
            margin: '0 0 12px',
            letterSpacing: '-0.01em',
          }}
        >
          {isPending ? 'Ya te enviamos el email' : 'Confirma tu email'}
        </h1>

        <p style={{ fontSize: 15, color: 'var(--mk-muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {isPending ? (
            <>Encontramos un registro pendiente con <strong style={{ color: 'var(--mk-text)' }}>{email}</strong>.</>
          ) : (
            <>Te enviamos un email a <strong style={{ color: 'var(--mk-text)' }}>{email || 'tu casilla'}</strong> con un link para activar tu cuenta.</>
          )}
        </p>

        <div
          style={{
            background: 'var(--mk-bg)',
            border: '1px solid var(--mk-border)',
            borderRadius: 12,
            padding: 20,
            textAlign: 'left',
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 14, fontWeight: 700, color: 'var(--mk-text)', margin: '0 0 12px' }}>
            ¿Qué sigue?
          </h2>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--mk-muted)', lineHeight: 1.8 }}>
            <li>Abre tu casilla de correo</li>
            <li>Busca un email de <strong style={{ color: 'var(--mk-text)' }}>noreply@opai.cl</strong></li>
            <li>Haz clic en el botón &ldquo;Confirmar mi cuenta&rdquo;</li>
            <li>Te llevaremos a tu nuevo portal</li>
          </ol>
        </div>

        <p style={{ fontSize: 13, color: 'var(--mk-muted)', margin: '0 0 16px' }}>
          ¿No te llegó? Revisa la carpeta de spam o promociones.
        </p>

        <button
          type="button"
          onClick={handleResend}
          disabled={!email || cooldown > 0 || resendStatus === 'sending'}
          className="registro-btn registro-btn-ghost"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            fontSize: 14,
          }}
        >
          {resendStatus === 'sending' ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Reenviando…
            </>
          ) : resendStatus === 'sent' ? (
            <>
              <CheckCircle2 size={14} color="var(--mk-teal)" />
              Reenviado
            </>
          ) : cooldown > 0 ? (
            <>Reenviar en {cooldown}s</>
          ) : (
            <>
              <RefreshCw size={14} />
              Reenviar email
            </>
          )}
        </button>

        {errorMsg && (
          <p style={{ fontSize: 13, color: 'var(--mk-orange)', marginTop: 12 }}>{errorMsg}</p>
        )}

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--mk-border)' }}>
          <p style={{ fontSize: 13, color: 'var(--mk-muted)', margin: 0 }}>
            ¿Te equivocaste de email?{' '}
            <a href="/registro" style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}>
              Volver al registro
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
