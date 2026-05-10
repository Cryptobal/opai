import { Suspense } from 'react';
import type { Metadata } from 'next';
import RegistroWizard from './RegistroWizard';
import './registro.css';

export const metadata: Metadata = {
  title: 'Crea tu cuenta — Opai',
  description: 'Completa tu registro en Opai. 30 días Profesional gratis, sin tarjeta.',
  robots: { index: false, follow: false },
};

export default function RegistroPage() {
  return (
    <Suspense
      fallback={
        <div className="registro-shell">
          <div className="registro-grid">
            <div className="registro-form-panel" style={{ minHeight: 400 }} />
          </div>
        </div>
      }
    >
      <RegistroWizard />
    </Suspense>
  );
}
