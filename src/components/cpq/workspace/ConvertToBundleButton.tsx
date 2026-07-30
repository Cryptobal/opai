"use client";

/**
 * Botón "⧉ Convertir en multi-instalación": convierte la cotización actual en
 * la primera instalación de una propuesta (bundle) sin cambiar de URL.
 * 422 sin negocio asociado → toast accionable (asociar negocio en Datos).
 */

import { useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-service";

export function useConvertToBundle(
  quoteId: string,
  onConverted: (bundleId: string, existing: boolean) => void,
) {
  const [converting, setConverting] = useState(false);

  const convert = async () => {
    if (converting) return;
    const confirmed = await confirmDialog({
      description:
        "Esta cotización pasará a ser la primera instalación de una propuesta multi-instalación. Podrás agregar más instalaciones y gobernar las condiciones comerciales a nivel propuesta. ¿Continuar?",
      confirmLabel: "Convertir",
    });
    if (!confirmed) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/convert-to-bundle`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo convertir la cotización");
        return;
      }
      if (json.data.existing) {
        toast.message("La cotización ya pertenece a una propuesta", {
          description: "Abriendo en modo multi-instalación.",
        });
      } else {
        toast.success(`Propuesta ${json.data.code} creada`);
      }
      onConverted(json.data.bundleId as string, Boolean(json.data.existing));
    } catch {
      toast.error("Error de red al convertir la cotización");
    } finally {
      setConverting(false);
    }
  };

  return { convert, converting };
}

export function ConvertToBundleButton({
  quoteId,
  onConverted,
  asMenuItem = false,
}: {
  quoteId: string;
  onConverted: (bundleId: string, existing: boolean) => void;
  /** true → item de overflow menu; false → botón outline (rail). */
  asMenuItem?: boolean;
}) {
  const { convert, converting } = useConvertToBundle(quoteId, onConverted);

  if (asMenuItem) {
    return (
      <button
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-medium text-primary hover:bg-accent"
        onClick={() => void convert()}
        disabled={converting}
      >
        <Layers className="h-3.5 w-3.5" />
        {converting ? "Convirtiendo..." : "Convertir en multi-instalación"}
      </button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 w-full justify-start gap-2 text-xs font-medium text-primary"
      onClick={() => void convert()}
      disabled={converting}
    >
      <Layers className="h-3.5 w-3.5" />
      {converting ? "Convirtiendo..." : "Multi-instalación"}
    </Button>
  );
}
