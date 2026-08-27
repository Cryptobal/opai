"use client";

import { useEffect, useState } from "react";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";

type StaffData = {
  status: "unassigned" | "assigned" | "retired";
  serialLabel: string;
  tenantName: string;
  tenantMonogram: string;
  tenantLogoUrl: string | null;
  installation: { id: string; name: string } | null;
  canAssign: boolean;
  actor: "erp" | "device" | null;
  deviceInstallation: { id: string; name: string; hasCoords: boolean } | null;
  installations: { id: string; name: string; address: string | null; hasCoords: boolean; distanceM: number | null }[];
};

function staffHeaders(): HeadersInit {
  const token = safeStorage.getItem(DEVICE_TOKEN_KEY);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function ReporteAsignarClient({
  token,
  fallbackTenantName,
  fallbackSerial,
}: {
  token: string;
  fallbackTenantName?: string | null;
  fallbackSerial?: string | null;
}) {
  const [staff, setStaff] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/reporte/${encodeURIComponent(token)}/staff`, { headers: staffHeaders() })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.success) setStaff(j.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function assign(installationId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/reporte/${encodeURIComponent(token)}/assign`, {
        method: "POST",
        headers: staffHeaders(),
        body: JSON.stringify({ installationId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo asignar");
      setDone(json.data.installationName ?? "la instalación");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const tenantName = staff?.tenantName ?? fallbackTenantName ?? "Seguridad";
  const serial = staff?.serialLabel ?? fallbackSerial ?? "";

  if (done) {
    return (
      <main className="r-page">
        <p className="r-kicker">Canal oficial de reportes</p>
        <h1>QR asignado</h1>
        <p className="r-address">
          {serial} quedó en {done}. Recarga o vuelve a escanear para reportar un incidente.
        </p>
        <div className="r-cta-wrap">
          <button type="button" className="r-cta" onClick={() => window.location.reload()}>
            Continuar a reportar
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="r-page">
        <p className="r-kicker">Canal oficial de reportes</p>
        <h1>Este código aún no está activo</h1>
        <p className="r-address">Verificando si puedes asignarlo…</p>
      </main>
    );
  }

  if (!staff?.canAssign) {
    return (
      <main className="r-page">
        <p className="r-kicker">Canal oficial de reportes</p>
        <h1>Este código aún no está activo</h1>
        <p className="r-address">
          Contacta a la administración del edificio o a {tenantName} para activar este canal.
        </p>
      </main>
    );
  }

  const filtered = staff.installations.filter((i) => {
    if (!query.trim()) return true;
    const hay = `${i.name} ${i.address ?? ""}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <main className="r-page">
      <header className="r-header">
        <div className="r-brand">
          {staff.tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={staff.tenantLogoUrl} alt="" />
          ) : (
            <span className="r-brand-mark" aria-hidden>
              {staff.tenantMonogram}
            </span>
          )}
          <div>
            <p className="r-kicker">Asignar adhesivo</p>
            <p className="r-tenant">{tenantName}</p>
          </div>
        </div>
      </header>

      <section className="r-install">
        <p className="r-install-label">Serial</p>
        <h1 className="r-code">{serial}</h1>
        {staff.installation ? (
          <p className="r-address">Hoy está en {staff.installation.name}. Puedes moverlo.</p>
        ) : (
          <p className="r-address">Este QR aún no tiene instalación. Asígalo para activar el canal de reportes.</p>
        )}
      </section>

      {staff.deviceInstallation ? (
        <div className="r-cta-wrap" style={{ position: "relative", marginBottom: 16 }}>
          <p className="r-hint">
            {staff.deviceInstallation.hasCoords
              ? `Dispositivo de ${staff.deviceInstallation.name}`
              : `${staff.deviceInstallation.name} no tiene GPS en la ficha`}
          </p>
          <button
            type="button"
            className="r-cta"
            disabled={busy || !staff.deviceInstallation.hasCoords}
            onClick={() => assign(staff.deviceInstallation!.id)}
          >
            {busy ? "Asignando…" : `Asignar a ${staff.deviceInstallation.name}`}
          </button>
        </div>
      ) : null}

      {staff.actor === "erp" ? (
        <section className="r-step">
          <h2>Elige la instalación</h2>
          <input
            className="r-contact"
            style={{
              minHeight: 44,
              borderRadius: 12,
              border: "1px solid var(--rp-line)",
              padding: "0 12px",
              width: "100%",
              font: "inherit",
            }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o dirección"
          />
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {filtered.map((inst) => (
              <li key={inst.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  disabled={busy || !inst.hasCoords}
                  onClick={() => assign(inst.id)}
                  style={{
                    width: "100%",
                    minHeight: 48,
                    textAlign: "left",
                    borderRadius: 14,
                    border: "1px solid var(--rp-line)",
                    background: "var(--rp-card)",
                    padding: "10px 12px",
                    cursor: inst.hasCoords ? "pointer" : "not-allowed",
                    opacity: inst.hasCoords ? 1 : 0.5,
                  }}
                >
                  <strong>{inst.name}</strong>
                  <div style={{ fontSize: 13, color: "var(--rp-muted)" }}>
                    {inst.hasCoords ? inst.address ?? "Con GPS" : "Sin coordenadas GPS"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="r-error" role="alert">{error}</p> : null}
    </main>
  );
}
