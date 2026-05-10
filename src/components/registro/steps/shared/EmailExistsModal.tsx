'use client';

import { useEffect } from 'react';

interface EmailExistsModalProps {
  open: boolean;
  email: string;
  onClose: () => void;
}

export function EmailExistsModal({ open, email, onClose }: EmailExistsModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-exists-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="mk-card"
        style={{
          maxWidth: 420,
          width: '100%',
          padding: 28,
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="email-exists-title"
          style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 20,
            fontWeight: 700,
            margin: '0 0 12px',
            color: 'var(--mk-text)',
          }}
        >
          Ya tienes una cuenta
        </h2>
        <p style={{ fontSize: 14, color: 'var(--mk-muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
          El email <strong style={{ color: 'var(--mk-text)' }}>{email}</strong> ya está registrado en Opai.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href={`/opai/login?email=${encodeURIComponent(email)}`}
            className="mk-btn-primary"
            style={{ padding: '12px 20px', fontSize: 14, justifyContent: 'center' }}
          >
            Iniciar sesión &rarr;
          </a>
          <button
            type="button"
            onClick={onClose}
            className="registro-btn registro-btn-ghost"
          >
            Usar otro email
          </button>
        </div>
      </div>
    </div>
  );
}
