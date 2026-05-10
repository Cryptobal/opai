'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * CTA inline del hero de la home: email + botón "Empezar gratis".
 * Submit envía directo a /registro?email=... para saltarse /registrarse.
 */
export function HeroEmailCta() {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (email) params.set('email', email);

    if (typeof window !== 'undefined') {
      const incoming = new URLSearchParams(window.location.search);
      for (const k of ['utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content', 'ref']) {
        const v = incoming.get(k);
        if (v) params.set(k, v);
      }
    }

    window.location.href = `/registro?${params.toString()}`;
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto 14px' }}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <input
          id="hero-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.cl"
          autoComplete="email"
          aria-label="Email corporativo"
          style={{
            flex: '1 1 240px',
            minWidth: 0,
            background: 'var(--mk-bg-card)',
            border: '1px solid var(--mk-border)',
            borderRadius: 8,
            padding: '15px 16px',
            fontFamily: 'var(--mk-font-b)',
            fontSize: 15,
            color: 'var(--mk-text)',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--mk-teal)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--mk-border)'; }}
        />
        <button
          type="submit"
          className="mk-btn-primary"
          style={{
            padding: '15px 24px',
            fontSize: 15,
            whiteSpace: 'nowrap',
            justifyContent: 'center',
          }}
        >
          Empezar gratis &rarr;
        </button>
      </form>
      <div
        style={{
          marginTop: 10,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--mk-muted)',
        }}
      >
        ¿Solo quieres ver planes?{' '}
        <Link
          href="/planes"
          style={{ color: 'var(--mk-teal)', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          Mira precios y planes &rarr;
        </Link>
      </div>
    </div>
  );
}
