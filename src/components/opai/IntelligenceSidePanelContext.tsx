"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface IntelligenceSidePanelContextValue {
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const IntelligenceSidePanelContext =
  createContext<IntelligenceSidePanelContextValue | null>(null);

const NOOP: IntelligenceSidePanelContextValue = {
  isPanelOpen: false,
  openPanel: () => {},
  closePanel: () => {},
  togglePanel: () => {},
};

export function useIntelligenceSidePanelContext() {
  const ctx = useContext(IntelligenceSidePanelContext);
  if (!ctx) return NOOP;
  return ctx;
}

/**
 * Estado abierto del dock OPAI Intelligence (desktop).
 * AppShell lo usa para empujar el layout (`lg:mr-[400px]`) sin overlay gris.
 * A diferencia de Chat/Notificaciones (que solo renderizan desde xl), este
 * dock no tiene guard xl: el margen aplica desde lg.
 */
export function IntelligenceSidePanelProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((p) => !p), []);

  return (
    <IntelligenceSidePanelContext.Provider
      value={{ isPanelOpen, openPanel, closePanel, togglePanel }}
    >
      {children}
    </IntelligenceSidePanelContext.Provider>
  );
}
