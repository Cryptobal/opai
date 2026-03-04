"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Error boundary de la app principal (CRM, Hub, OPAI, etc.).
 * Cuando hay una excepción en cliente, se muestra esta UI con opción de recuperación.
 * Importante en móvil y acceso directo: el botón "Refrescar la página" permite recuperar sin poder recargar manualmente.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP_ERROR]", error);
  }, [error]);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <AlertTriangle className="h-14 w-14 text-destructive/90 mb-4" />
      <h2 className="text-xl font-semibold text-foreground text-center mb-2">
        Algo salió mal
      </h2>
      <p className="text-sm text-muted-foreground max-w-md text-center mb-6">
        Ocurrió un error inesperado. Puedes intentar de nuevo o refrescar la página para recuperar la aplicación.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <Button
          onClick={handleRefresh}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refrescar la página
        </Button>
        <Button onClick={reset} variant="outline">
          Reintentar
        </Button>
      </div>
    </div>
  );
}
