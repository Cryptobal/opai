"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Tone = "ok" | "danger";

/** Mensajes humanos en español por cada razón que devuelve el callback OAuth. */
const MESSAGES: Record<string, { tone: Tone; text: string }> = {
  connected: { tone: "ok", text: "Conexión completada correctamente." },
  google_access_denied: {
    tone: "danger",
    text: "Cancelaste la autorización en Google — reintentá y aceptá los permisos.",
  },
  invalid_state: { tone: "danger", text: "La sesión de conexión expiró, reintentá." },
  missing_env: {
    tone: "danger",
    text: "Faltan variables de entorno en el servidor. Avisá a soporte.",
  },
  missing_tokens: {
    tone: "danger",
    text: "Google no entregó permisos completos — reintentá y aceptá todo.",
  },
  missing_scope: {
    tone: "danger",
    text: "Faltan permisos — aceptá todos los accesos que pide Google y reintentá.",
  },
  forbidden: {
    tone: "danger",
    text: "Necesitás rol owner o admin para conectar esta integración.",
  },
  error: { tone: "danger", text: "No se pudo completar la conexión, reintentá." },
};

function resolveMessage(value: string): { tone: Tone; text: string } {
  const known = MESSAGES[value];
  if (known) return known;
  if (value.startsWith("google_")) {
    return {
      tone: "danger",
      text: `Google rechazó la autorización (${value.replace("google_", "")}). Reintentá.`,
    };
  }
  return MESSAGES.error;
}

/**
 * Lee el query param de resultado (`cal=`/`drive=`) que deja el callback OAuth,
 * muestra un banner DS (ok/danger) + toast, ofrece "Reintentar" y limpia el
 * param de la URL. Ningún resultado queda invisible.
 */
type BannerProps = {
  param: "cal" | "drive";
  startHref: string;
  onConnected?: () => void;
};

/** Wrapper con Suspense propio: `useSearchParams` exige un boundary en build. */
export function OAuthResultBanner(props: BannerProps) {
  return (
    <Suspense fallback={null}>
      <OAuthResultBannerInner {...props} />
    </Suspense>
  );
}

function OAuthResultBannerInner({ param, startHref, onConnected }: BannerProps) {
  const sp = useSearchParams();
  const [result, setResult] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    const value = sp.get(param);
    if (!value || handled.current) return;
    handled.current = true;
    setResult(value);
    const info = resolveMessage(value);
    if (info.tone === "ok") {
      toast.success(info.text);
      onConnected?.();
    } else {
      toast.error(info.text);
    }
    // Limpiar el param de la URL tras mostrar (sin recargar).
    const url = new URL(window.location.href);
    url.searchParams.delete(param);
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [sp, param, onConnected]);

  if (!result) return null;
  const info = resolveMessage(result);
  const toneClass =
    info.tone === "ok"
      ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
      : "border-status-danger-border bg-status-danger-soft text-status-danger-fg";

  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[13px] ${toneClass}`}
    >
      <span className="pt-1">{info.text}</span>
      <div className="flex shrink-0 items-center gap-2">
        {info.tone === "danger" && (
          <Button asChild size="sm" variant="outline">
            <a href={startHref}>Reintentar</a>
          </Button>
        )}
        <button
          type="button"
          onClick={() => setResult(null)}
          aria-label="Cerrar"
          className="rounded-lg p-1 ds-tap opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
