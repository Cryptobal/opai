'use client';

import { Fragment } from 'react';

const STEPS = [
  { id: 1, label: 'Tu cuenta' },
  { id: 2, label: 'Tu empresa' },
  { id: 3, label: 'Confirmar' },
] as const;

export function WizardStepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="registro-stepper" aria-label="Progreso del registro">
      {STEPS.map((s, idx) => {
        const status = current === s.id ? 'active' : current > s.id ? 'done' : 'pending';
        return (
          <Fragment key={s.id}>
            <div
              className={`registro-step ${status === 'active' ? 'active' : status === 'done' ? 'done' : ''}`}
              aria-current={status === 'active' ? 'step' : undefined}
            >
              <span className={`registro-step-dot ${status}`}>
                {status === 'done' ? '✓' : s.id}
              </span>
              <span className="registro-step-label">{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && <span className="registro-step-divider" />}
          </Fragment>
        );
      })}
    </div>
  );
}
