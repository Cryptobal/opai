'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { WizardState } from '@/components/registro/lib/wizard-state';

interface PreviewPanelProps {
  state: WizardState;
}

export function PreviewPanel({ state }: PreviewPanelProps) {
  const slug = state.step2.proposedSlug || 'tu-empresa';
  const subdomain = `${slug}.opai.cl`;

  return (
    <aside className="registro-preview-panel" aria-labelledby="preview-title">
      <div style={{ marginBottom: 16 }}>
        <h2
          id="preview-title"
          style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--mk-text)',
            margin: '0 0 4px',
          }}
        >
          Tu cuenta Opai
        </h2>
        <p style={{ fontSize: 12, color: 'var(--mk-muted)', margin: 0 }}>
          Esto es lo que se va creando mientras avanzas
        </p>
      </div>

      <div style={{ marginBottom: 16, padding: 12, background: 'var(--mk-bg)', borderRadius: 8, border: '1px solid var(--mk-border)' }}>
        <div style={{ fontSize: 11, color: 'var(--mk-muted)', fontFamily: 'var(--mk-font-m)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tu portal
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mk-teal)', fontFamily: 'var(--mk-font-m)', marginTop: 4, wordBreak: 'break-all' }}>
          {subdomain}
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {state.step1.email && (
          <motion.div
            key="email"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="registro-preview-row"
          >
            <span className="registro-preview-key">Email</span>
            <span className="registro-preview-val">{state.step1.email}</span>
          </motion.div>
        )}
        {state.step1.ownerName && (
          <motion.div
            key="ownerName"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="registro-preview-row"
          >
            <span className="registro-preview-key">Tu nombre</span>
            <span className="registro-preview-val">{state.step1.ownerName}</span>
          </motion.div>
        )}
        {state.step2.commercialName && (
          <motion.div
            key="commercialName"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="registro-preview-row"
          >
            <span className="registro-preview-key">Empresa</span>
            <span className="registro-preview-val">{state.step2.commercialName}</span>
          </motion.div>
        )}
        {state.step2.legalName && state.step2.legalName !== state.step2.commercialName && (
          <motion.div
            key="legalName"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="registro-preview-row"
          >
            <span className="registro-preview-key">Razón social</span>
            <span className="registro-preview-val">{state.step2.legalName}</span>
          </motion.div>
        )}
        {state.step2.companyRut && (
          <motion.div
            key="rut"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="registro-preview-row"
          >
            <span className="registro-preview-key">RUT</span>
            <span className="registro-preview-val">{state.step2.companyRut}</span>
          </motion.div>
        )}
        {state.step2.commune && (
          <motion.div
            key="address"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="registro-preview-row"
          >
            <span className="registro-preview-key">Ubicación</span>
            <span className="registro-preview-val">
              {[state.step2.commune, state.step2.city].filter(Boolean).join(', ')}
            </span>
          </motion.div>
        )}
        {state.step3.estimatedGuards && (
          <motion.div
            key="guards"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="registro-preview-row"
          >
            <span className="registro-preview-key">Guardias</span>
            <span className="registro-preview-val">{state.step3.estimatedGuards}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ marginTop: 20, padding: 12, background: 'var(--mk-teal-dim)', border: '1px solid var(--mk-teal-glow)', borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--mk-text)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--mk-teal)' }}>30 días Profesional gratis.</strong>
          {' '}Sin tarjeta. Después pasas a Gratis automáticamente.
        </div>
      </div>
    </aside>
  );
}
