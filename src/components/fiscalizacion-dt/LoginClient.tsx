"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalFrame } from "./PortalFrame";

export function LoginClient({ version }: { version: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "entering">("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/fiscalizacion-dt/sesion")
      .then((r) => r.json())
      .then((json) => {
        if (json.session?.tenantId) router.replace(`/fiscalizacion-dt/${json.session.tenantId}/reportes`);
        else if (json.session) router.replace("/fiscalizacion-dt/empleadores");
      })
      .catch(() => {});
  }, [router]);

  async function solicitarClave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setStatus("sending");
    const res = await fetch("/api/fiscalizacion-dt/solicitar-clave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    setStatus("idle");
    if (res.status === 429) {
      setError("Límite de solicitudes alcanzado. Intente más tarde.");
      return;
    }
    if (res.status === 403) {
      setError(json.error || "Solo se aceptan correos institucionales con dominio @dt.gob.cl.");
      return;
    }
    if (!res.ok) {
      setError(json.error || "No se pudo solicitar la clave");
      return;
    }
    setStatus("sent");
    setInfo(json.message || "Clave enviada al correo institucional. Vigencia: 5 días corridos.");
  }

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("entering");
    const res = await fetch("/api/fiscalizacion-dt/ingresar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const json = await res.json();
    setStatus("idle");
    if (!res.ok) {
      setError(json.error || "Clave inválida o expirada");
      return;
    }
    router.push("/fiscalizacion-dt/empleadores");
  }

  return (
    <PortalFrame version={version}>
      <div className="mx-auto max-w-md space-y-6 ds-page-enter">
        <div>
          <h1 className="font-display text-xl font-semibold">Portal de Fiscalización</h1>
          <p className="mt-1 text-[13px] text-ds-text-3">
            Ingreso exclusivo para funcionarios de la Dirección del Trabajo (correo @dt.gob.cl).
          </p>
        </div>

        <form onSubmit={solicitarClave} className="space-y-3 rounded-xl border border-ds-border-default bg-ds-surface-2 p-4">
          <label className="block text-[13px]" htmlFor="email">
            Correo institucional
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
            placeholder="nombre@dt.gob.cl"
            required
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="ds-tap h-10 w-full rounded-lg bg-primary text-[13px] font-medium text-primary-foreground"
          >
            {status === "sending" ? "Enviando…" : status === "sent" ? "Clave enviada" : "Solicitar clave"}
          </button>
        </form>

        <form onSubmit={ingresar} className="space-y-3 rounded-xl border border-ds-border-default bg-ds-surface-2 p-4">
          <label className="block text-[13px]" htmlFor="code">
            Clave
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 font-mono text-[13px] tracking-widest"
            maxLength={10}
            autoComplete="one-time-code"
            required
          />
          <button
            type="submit"
            disabled={status === "entering"}
            className="ds-tap h-10 w-full rounded-lg border border-ds-border-default text-[13px] font-medium"
          >
            {status === "entering" ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        {info ? <p className="text-[13px] text-status-ok-fg">{info}</p> : null}
        {error ? <p className="text-[13px] text-status-danger-fg">{error}</p> : null}
      </div>
    </PortalFrame>
  );
}
