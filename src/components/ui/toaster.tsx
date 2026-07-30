/**
 * Global toast host (Sonner) — avisos informativos (éxito/error).
 * Las acciones reversibles usan `<UndoSnackbarHost />` (Liquid Glass), no Sonner.
 */
"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";

export function Toaster() {
  const isMobile = useIsMobileViewport();

  return (
    <SonnerToaster
      theme="system"
      richColors={false}
      position={isMobile ? "bottom-center" : "bottom-right"}
      closeButton={false}
      expand
      gap={10}
      visibleToasts={4}
      duration={3500}
      offset={isMobile ? "calc(var(--bottom-nav-height, 76px) + 16px)" : "16px"}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "!opai-toast !text-foreground !rounded-2xl !px-4 !py-3 !shadow-2xl !border",
          description: "!text-muted-foreground",
          actionButton:
            "!bg-transparent !text-primary !rounded-md !px-2 !py-1.5 !text-ds-body !font-semibold !ml-auto !shadow-none",
          cancelButton:
            "!bg-transparent !text-muted-foreground !rounded-md !px-2 !py-1.5 !text-ds-body !font-medium",
          error: "!border-status-danger-border",
          success: "!border-status-ok-border",
          warning: "!border-status-warn-border",
          info: "!border-status-info-border",
        },
      }}
    />
  );
}
