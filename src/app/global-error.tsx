"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Página de error global: captura excepciones que no atrapa ningún error boundary.
 * Se muestra cuando ocurre "Application error: a client-side exception has occurred".
 * Incluye botón para refrescar la página (crítico en móvil/acceso directo donde no se puede recargar).
 * Los errores se envían a Sentry cuando está configurado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          boxSizing: "border-box",
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#e2e8f0",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "360px" }}>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "8px",
            }}
          >
            Algo salió mal
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#94a3b8",
              marginBottom: "24px",
              lineHeight: 1.5,
            }}
          >
            Ocurrió un error inesperado. Refresca la página para volver a intentar.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              alignItems: "stretch",
            }}
          >
            <button
              type="button"
              onClick={handleRefresh}
              style={{
                padding: "12px 24px",
                fontSize: "1rem",
                fontWeight: 500,
                color: "#fff",
                backgroundColor: "#0d9488",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Refrescar la página
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "12px 24px",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#94a3b8",
                backgroundColor: "transparent",
                border: "1px solid #334155",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
