'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';

export function TurnstileWidget({
  onVerify,
  onExpire,
  onError,
  theme = 'auto',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) {
      setError('Captcha no configurado. Contacta a soporte.');
      return;
    }

    if (window.turnstile) {
      setScriptReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile"]`,
    );
    if (existing) {
      window.onTurnstileLoad = () => setScriptReady(true);
      return;
    }

    window.onTurnstileLoad = () => setScriptReady(true);
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onerror = () => setError('No se pudo cargar el captcha. Recarga la página.');
    document.head.appendChild(script);
  }, [siteKey]);

  useEffect(() => {
    if (!scriptReady || !containerRef.current || widgetIdRef.current || !siteKey) return;

    try {
      widgetIdRef.current = window.turnstile!.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        callback: onVerify,
        'expired-callback': () => {
          onExpire?.();
        },
        'error-callback': () => {
          setError('El captcha falló. Reintenta.');
          onError?.();
        },
      });
    } catch (e) {
      console.error('[Turnstile] render failed', e);
      setError('No se pudo iniciar el captcha.');
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // noop
        }
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, siteKey, theme, onVerify, onExpire, onError]);

  if (error) {
    return (
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: 'var(--mk-text)',
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }

  return <div ref={containerRef} style={{ minHeight: 65 }} />;
}
