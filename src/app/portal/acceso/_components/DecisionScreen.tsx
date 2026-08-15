"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ResultMetaChip, ResultScreen, XlButton } from "@/components/opai/terreno";

/** Copy fijo: no hay protocolo de lista negra en config/BD (H-A4). */
const PROTOCOL_LINES = [
  "No permitir el ingreso.",
  "No discutir el motivo con la persona.",
  "Registrar el rechazo y avisar a jefatura.",
];

export interface DecisionScreenProps {
  authorized: boolean;
  name?: string;
  rut: string;
  context?: ReactNode;
  chips?: ReactNode;
  showProtocol?: boolean;
  confirmLabel: string;
  onConfirm: () => void;
}

export function DecisionScreen({
  authorized,
  name,
  rut,
  context,
  chips,
  showProtocol,
  confirmLabel,
  onConfirm,
}: DecisionScreenProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const screen = (
    <ResultScreen
      // Portal a body + z-[60] por encima de PlatformAwareBottomNav (z-50):
      // el CTA no queda tapado por Inicio/Registro/En Sitio/Más.
      className="fixed inset-0 z-[60] min-h-dvh"
      tone={authorized ? "ok" : "bad"}
      icon={
        authorized ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        )
      }
      title={authorized ? "AUTORIZADO" : "NO AUTORIZADO"}
      who={
        <div>
          {name ? <div>{name}</div> : null}
          <div className="mt-1 font-mono text-base font-medium text-white">{rut}</div>
          {context ? <div className="mt-2 text-sm font-normal text-white">{context}</div> : null}
        </div>
      }
      meta={chips}
      footer={
        <div className="space-y-4">
          {showProtocol ? (
            <div className="rounded-xl border border-dashed border-white/40 px-4 py-3 text-left">
              <p className="mb-2 font-mono text-[12px] font-semibold uppercase tracking-widest text-white">
                Protocolo lista negra
              </p>
              <ul className="space-y-1 text-sm text-white">
                {PROTOCOL_LINES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <XlButton variant={authorized ? "ok" : "bad"} size="lg" onClick={onConfirm}>
            {confirmLabel}
          </XlButton>
        </div>
      }
    />
  );

  // Hasta hidratar, render en árbol; luego portal a body para escapar
  // stacking contexts del shell (main overflow, etc.).
  if (!mounted) return screen;
  return createPortal(screen, document.body);
}

export { ResultMetaChip };
