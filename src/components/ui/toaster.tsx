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
      position="bottom-right"
      closeButton
      expand={false}
      duration={4000}
      toastOptions={{
        className: "!bg-card !border-border !text-foreground",
      }}
    />
  );
}
