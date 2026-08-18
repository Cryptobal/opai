"use client";

/**
 * Provider global: cualquier pantalla puede abrir un documento con
 * `useDocumentViewer().open({ url, filename })` y el usuario ve el
 * overlay con el botón Compartir (iOS).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DocumentViewerOverlay,
  type DocumentViewerDoc,
} from "./DocumentViewerOverlay";

type DocumentViewerApi = {
  open: (doc: DocumentViewerDoc) => void;
  close: () => void;
};

const DocumentViewerContext = createContext<DocumentViewerApi | null>(null);

export function DocumentViewerProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<DocumentViewerDoc | null>(null);

  const open = useCallback((next: DocumentViewerDoc) => {
    setDoc(next);
  }, []);

  const close = useCallback(() => setDoc(null), []);

  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <DocumentViewerContext.Provider value={api}>
      {children}
      <DocumentViewerOverlay doc={doc} onClose={close} />
    </DocumentViewerContext.Provider>
  );
}

export function useDocumentViewer(): DocumentViewerApi {
  const ctx = useContext(DocumentViewerContext);
  if (!ctx) {
    return {
      open: (doc) => {
        // Fallback sin provider: Web Share directo (mejor que window.open).
        void import("@/lib/files/download-or-share").then(({ downloadOrShareFile }) =>
          downloadOrShareFile({
            url: doc.url,
            filename: doc.filename,
            mimeType: doc.mimeType || "application/pdf",
          }),
        );
      },
      close: () => undefined,
    };
  }
  return ctx;
}
