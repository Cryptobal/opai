'use client';

import { useState } from 'react';

export type TenantAccessBannerKey = 'trial_expiring' | 'trial_expired' | 'past_due';

const COPY: Record<
  TenantAccessBannerKey,
  { message: (days?: number | null) => string; variant: 'warn' | 'danger' }
> = {
  trial_expiring: {
    message: (days) =>
      days == null
        ? 'Tu trial está por vencer.'
        : days <= 0
          ? 'Tu trial vence hoy.'
          : `Tu trial vence en ${days} día${days === 1 ? '' : 's'}.`,
    variant: 'warn',
  },
  trial_expired: {
    message: () => 'Trial vencido — tu cuenta está en solo lectura. Contacta a ventas para activar.',
    variant: 'danger',
  },
  past_due: {
    message: () => 'Pago pendiente. Regulariza para evitar la suspensión.',
    variant: 'warn',
  },
};

export function TenantAccessBanner({
  bannerKey,
  daysLeft,
}: {
  bannerKey?: string | null;
  daysLeft?: number | null;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!bannerKey || !(bannerKey in COPY)) return null;
  const cfg = COPY[bannerKey as TenantAccessBannerKey];
  const variant = cfg.variant;

  const wrap =
    variant === 'danger'
      ? 'bg-status-danger-soft text-status-danger-fg border-status-danger-border'
      : 'bg-status-warn-soft text-status-warn-fg border-status-warn-border';

  const requestActivation = async () => {
    if (sending || sent) return;
    setSending(true);
    try {
      await fetch('/api/tenant/plan/upgrade-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedPlan: 'profesional',
          message: `Solicitud desde banner de acceso (${bannerKey})`,
        }),
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className={`flex flex-col gap-2 border-b px-4 py-2 sm:flex-row sm:items-center sm:justify-center sm:gap-3 ${wrap}`}
    >
      <p className="text-[13px] font-medium">{cfg.message(daysLeft)}</p>
      <button
        type="button"
        onClick={requestActivation}
        disabled={sending || sent}
        className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-70 sm:h-10"
      >
        {sent ? 'Solicitud enviada' : sending ? 'Enviando…' : 'Solicitar activación'}
      </button>
    </div>
  );
}
