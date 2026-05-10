import { Suspense } from 'react';
import type { Metadata } from 'next';
import VerificarEmailClient from './VerificarEmailClient';

export const metadata: Metadata = {
  title: 'Verifica tu email — Opai',
  robots: { index: false, follow: false },
};

export default function VerificarEmailPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80 }} />}>
      <VerificarEmailClient />
    </Suspense>
  );
}
