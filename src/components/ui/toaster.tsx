/**
 * Global toast host (Sonner) — liquid-glass + mobile-aware positioning
 *
 * `expand` se mantiene en true para que las toasts se apilen como lista
 * vertical (en lugar de superponerse en abanico). Las nuevas toasts empujan
 * a las anteriores hacia arriba con animación.
 */
"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";

export function Toaster() {
  const isMobile = useIsMobileViewport();

  return (
    <SonnerToaster
      theme="dark"
      richColors={false}
      position={isMobile ? "bottom-center" : "bottom-right"}
      closeButton
      expand
      gap={12}
      visibleToasts={5}
      duration={4000}
      offset={isMobile ? "calc(env(safe-area-inset-bottom) + 80px)" : "16px"}
      toastOptions={{
        unstyled: false,
        // `opai-toast` se define en globals.css y reemplaza al glass altamente
        // translúcido para evitar que múltiples toasts se fundan visualmente
        // entre sí cuando se apilan.
        classNames: {
          toast:
            "!opai-toast !text-foreground !rounded-2xl !p-4 !shadow-2xl !border",
          description: "!text-muted-foreground",
          actionButton:
            "!opai-liquid-glass-button !text-white !rounded-full !px-3 !py-1.5 !text-xs !font-medium !ml-auto",
          cancelButton:
            "!bg-transparent !text-muted-foreground !rounded-full !px-3 !py-1.5 !text-xs !font-medium",
          closeButton:
            "!bg-transparent !border-0 !text-muted-foreground hover:!text-foreground",
          error: "!border-status-danger-border",
          success: "!border-status-ok-border",
          warning: "!border-status-warn-border",
          info: "!border-status-info-border",
        },
      }}
    />
  );
}
