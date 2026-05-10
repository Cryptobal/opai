'use client';

import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export type RutLookupStatus = 'idle' | 'loading' | 'success' | 'error' | 'not_found';

interface RutLookupCardProps {
  status: RutLookupStatus;
  errorMsg?: string;
  data?: {
    razonSocial: string | null;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
  };
  onManualEntry?: () => void;
  onRetry?: () => void;
}

export function RutLookupCard({
  status,
  errorMsg,
  data,
  onManualEntry,
  onRetry,
}: RutLookupCardProps) {
  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div
        style={{
          padding: 16,
          background: 'var(--mk-teal-dim)',
          border: '1px solid var(--mk-teal-glow)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 8,
        }}
      >
        <Loader2 className="animate-spin" size={18} color="var(--mk-teal)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mk-text)' }}>
            Consultando al SII…
          </div>
          <div style={{ fontSize: 12, color: 'var(--mk-muted)', marginTop: 2 }}>
            Puede tardar entre 30 y 90 segundos
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success' && data) {
    return (
      <div
        style={{
          padding: 16,
          background: 'var(--mk-teal-dim)',
          border: '1px solid var(--mk-teal-glow)',
          borderRadius: 8,
          marginTop: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <CheckCircle2 size={18} color="var(--mk-teal)" />
          <strong style={{ fontSize: 13, color: 'var(--mk-text)' }}>
            Empresa encontrada en SII
          </strong>
        </div>
        <dl style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--mk-muted)' }}>
          {data.razonSocial && (
            <div>
              <dt style={{ display: 'inline', fontWeight: 500, color: 'var(--mk-text)' }}>Razón social: </dt>
              <dd style={{ display: 'inline', margin: 0 }}>{data.razonSocial}</dd>
            </div>
          )}
          {data.giro && (
            <div>
              <dt style={{ display: 'inline', fontWeight: 500, color: 'var(--mk-text)' }}>Giro: </dt>
              <dd style={{ display: 'inline', margin: 0 }}>{data.giro}</dd>
            </div>
          )}
          {(data.direccion || data.comuna) && (
            <div>
              <dt style={{ display: 'inline', fontWeight: 500, color: 'var(--mk-text)' }}>Dirección: </dt>
              <dd style={{ display: 'inline', margin: 0 }}>
                {[data.direccion, data.comuna, data.ciudad].filter(Boolean).join(', ')}
              </dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  if (status === 'error' || status === 'not_found') {
    const isNotFound = status === 'not_found';
    return (
      <div
        style={{
          padding: 16,
          background: 'rgba(255,90,53,0.08)',
          border: '1px solid rgba(255,90,53,0.25)',
          borderRadius: 8,
          marginTop: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <AlertCircle size={18} color="var(--mk-orange)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ fontSize: 13, color: 'var(--mk-text)' }}>
              {isNotFound ? 'RUT sin registros en SII' : 'No pudimos consultar al SII'}
            </strong>
            {errorMsg && !isNotFound && (
              <p style={{ fontSize: 12, color: 'var(--mk-muted)', margin: '4px 0 0' }}>
                {errorMsg}
              </p>
            )}
            {isNotFound && (
              <p style={{ fontSize: 12, color: 'var(--mk-muted)', margin: '4px 0 0' }}>
                Si tu empresa es nueva o no tiene inicio de actividades aún, puedes ingresar los datos manualmente.
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {!isNotFound && onRetry && (
            <button type="button" onClick={onRetry} className="registro-btn registro-btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }}>
              Reintentar
            </button>
          )}
          {onManualEntry && (
            <button type="button" onClick={onManualEntry} className="registro-btn registro-btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }}>
              Ingresar manualmente
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
