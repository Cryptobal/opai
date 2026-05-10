'use client';

import { calculatePasswordStrength } from '@/components/registro/lib/validation';

const COLORS = ['#5A6578', '#FF5A35', '#FFB020', '#00D4B0', '#00D4B0'];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const result = calculatePasswordStrength(password);
  const filled = Math.max(1, result.score);
  const color = COLORS[result.score];

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }} aria-label="Fortaleza de contraseña">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i < filled ? color : 'var(--mk-border)',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
        <span style={{ color }}>{result.label}</span>
        {result.hints[0] && (
          <span style={{ color: 'var(--mk-muted)' }}>{result.hints[0]}</span>
        )}
      </div>
    </div>
  );
}
