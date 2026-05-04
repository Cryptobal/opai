"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Building2, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DeactivateInstallationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installationId: string;
  installationName: string;
  dealTitle: string;
  onCompleted?: () => void;
}

export function DeactivateInstallationDialog({
  open,
  onOpenChange,
  installationId,
  installationName,
  dealTitle,
  onCompleted,
}: DeactivateInstallationDialogProps) {
  const [loading, setLoading] = React.useState(false);

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/installations/${installationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Error al desactivar instalación");
      }
      toast.success(`Instalación "${installationName}" desactivada`);
      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al desactivar");
    } finally {
      setLoading(false);
    }
  };

  const handleKeep = () => {
    toast.info(`Instalación "${installationName}" se mantiene activa`);
    onOpenChange(false);
    onCompleted?.();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "opai-liquid-glass",
            "fixed z-50 grid w-full max-w-md gap-4 p-6 rounded-2xl",
            "inset-x-4 bottom-4 sm:inset-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "duration-300"
          )}
        >
          <div className="relative z-10 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-300/30">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-2 flex-1">
              <DialogPrimitive.Title className="text-base font-semibold text-white">
                Negocio perdido — ¿desactivar instalación?
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-white/75 leading-relaxed">
                El negocio{" "}
                <span className="font-medium text-white">&quot;{dealTitle}&quot;</span>{" "}
                fue marcado como perdido. Este negocio activó la instalación a
                continuación, y aún no tiene operación registrada (sin pautas,
                asistencias ni marcaciones).
              </DialogPrimitive.Description>
            </div>
          </div>

          <div className="relative z-10 mx-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center gap-3">
            <Building2 className="h-4 w-4 text-white/60 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {installationName}
              </p>
              <p className="text-xs text-white/50">Sin operación registrada</p>
            </div>
            <span className="text-xs text-emerald-300/80 px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-300/20">
              Activa
            </span>
          </div>

          <div className="relative z-10 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
            <button
              type="button"
              onClick={handleKeep}
              disabled={loading}
              className={cn(
                "opai-liquid-glass-button",
                "px-4 py-2 rounded-xl text-sm font-medium text-white/90 hover:text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Mantener activa
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={loading}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium",
                "bg-amber-500/90 hover:bg-amber-500 text-white",
                "shadow-[0_8px_24px_rgba(245,158,11,0.4)]",
                "border border-amber-400/30",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2"
              )}
            >
              <Power className="h-4 w-4" />
              {loading ? "Desactivando..." : "Desactivar instalación"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
