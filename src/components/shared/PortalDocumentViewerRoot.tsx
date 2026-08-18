"use client";

import type { ReactNode } from "react";
import { DocumentViewerProvider } from "@/components/shared/DocumentViewerProvider";

/** Wrapper cliente para montar el visor/compartir en layouts de portal (SC). */
export function PortalDocumentViewerRoot({ children }: { children: ReactNode }) {
  return <DocumentViewerProvider>{children}</DocumentViewerProvider>;
}
