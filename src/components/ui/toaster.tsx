/**
 * Global toast host (Sonner) — Dark theme
 */
"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      richColors
      position="top-right"
      closeButton
      expand={false}
      visibleToasts={3}
      duration={4000}
      toastOptions={{
        className: "!bg-card !border-border !text-foreground",
      }}
    />
  );
}
