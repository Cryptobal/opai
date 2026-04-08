"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface DpaStatus {
  accepted: boolean;
  acceptedAt: string | null;
  version: string | null;
  currentVersion: string;
}

interface Props {
  /** Solo se muestra para owner/admin del tenant. */
  userRole: string;
}

/**
 * Banner/modal de aceptación del DPA (Ley 21.719).
 * Aparece para owners/admins que aún no han aceptado el contrato.
 */
export function DpaConsentBanner({ userRole }: Props) {
  const [status, setStatus] = useState<DpaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = userRole === "owner" || userRole === "admin";

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    fetch("/api/tenant/dpa/accept")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setStatus(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/tenant/dpa/accept", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("DPA aceptado correctamente");
      setStatus({
        accepted: true,
        acceptedAt: new Date().toISOString(),
        version: status?.currentVersion ?? "1.0",
        currentVersion: status?.currentVersion ?? "1.0",
      });
    } catch {
      toast.error("No se pudo registrar la aceptación");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !isAdmin || !status || status.accepted) return null;

  return (
    <div
      role="dialog"
      aria-label="Aceptación de Contrato de Encargado de Tratamiento"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        maxWidth: 420,
        zIndex: 9998,
        background: "rgba(6, 10, 19, 0.97)",
        border: "1px solid rgba(96, 165, 250, 0.4)",
        borderRadius: 12,
        padding: 20,
        color: "rgba(255,255,255,0.9)",
        fontSize: "0.875rem",
        boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: "1rem", fontWeight: 600 }}>
        Acción requerida — Ley 21.719
      </h3>
      <p style={{ margin: "0 0 12px", lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}>
        Para cumplir con la Ley de Protección de Datos Personales, necesitas aceptar el
        Contrato de Encargado de Tratamiento (DPA) que regula cómo Opai procesa los datos
        de tus trabajadores y clientes.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <a
          href="/dpa"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#60a5fa",
            textDecoration: "underline",
            fontSize: "0.875rem",
          }}
        >
          Ver contrato
        </a>
        <button
          onClick={handleAccept}
          disabled={submitting}
          style={{
            marginLeft: "auto",
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            cursor: submitting ? "wait" : "pointer",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {submitting ? "Registrando..." : "Aceptar DPA"}
        </button>
      </div>
    </div>
  );
}
