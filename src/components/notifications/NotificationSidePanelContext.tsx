"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface NotificationSidePanelContextValue {
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const NotificationSidePanelContext =
  createContext<NotificationSidePanelContextValue | null>(null);

const NOOP: NotificationSidePanelContextValue = {
  isPanelOpen: false,
  openPanel: () => {},
  closePanel: () => {},
  togglePanel: () => {},
};

export function useNotificationSidePanelContext() {
  const ctx = useContext(NotificationSidePanelContext);
  if (!ctx) return NOOP;
  return ctx;
}

export function NotificationSidePanelProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((p) => !p), []);

  return (
    <NotificationSidePanelContext.Provider
      value={{ isPanelOpen, openPanel, closePanel, togglePanel }}
    >
      {children}
    </NotificationSidePanelContext.Provider>
  );
}
