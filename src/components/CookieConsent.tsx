"use client";

import { useState, useEffect, useCallback } from "react";

const CONSENT_KEY = "opai-cookie-consent";
type ConsentValue = "accepted" | "rejected" | null;

/**
 * Hook para leer/escribir consentimiento de cookies (Ley 21.719).
 */
export function useCookieConsent() {
  const [consent, setConsent] = useState<ConsentValue>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY) as ConsentValue;
      setConsent(stored);
    } catch {
      // localStorage no disponible (SSR/incógnito)
    }
    setLoaded(true);
  }, []);

  const accept = useCallback(() => {
    try {
      localStorage.setItem(CONSENT_KEY, "accepted");
    } catch {}
    setConsent("accepted");
  }, []);

  const reject = useCallback(() => {
    try {
      localStorage.setItem(CONSENT_KEY, "rejected");
    } catch {}
    setConsent("rejected");
  }, []);

  return { consent, loaded, accept, reject };
}

/**
 * Banner de consentimiento de cookies — Ley 21.719.
 * Oculto en rutas de portales (no usan GTM/GA4 de marketing).
 */
export function CookieConsentBanner() {
  const { consent, loaded, accept, reject } = useCookieConsent();
  const [pathname, setPathname] = useState<string>("");

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  if (!loaded || consent !== null) return null;
  if (pathname.startsWith("/portal/") || pathname.startsWith("/postulacion/")) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "rgba(6, 10, 19, 0.97)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        padding: "16px 24px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        fontSize: "0.875rem",
        color: "rgba(255,255,255,0.8)",
      }}
    >
      <p style={{ maxWidth: "700px", margin: 0, lineHeight: 1.5 }}>
        Usamos cookies de análisis (Google Analytics) para mejorar tu experiencia.
        Puedes aceptar o rechazar su uso. Más info en nuestra{" "}
        <a href="/privacidad" style={{ color: "#60a5fa", textDecoration: "underline" }}>
          Política de Privacidad
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
        <button
          onClick={reject}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Rechazar
        </button>
        <button
          onClick={accept}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          Aceptar cookies
        </button>
      </div>
    </div>
  );
}
