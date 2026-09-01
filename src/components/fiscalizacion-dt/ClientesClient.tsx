"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PortalFrame } from "./PortalFrame";
import type { DtClienteArt26 } from "@/lib/fiscalizacion-dt/clientes";

function Tabla({ title, rows }: { title: string; rows: DtClienteArt26[] }) {
  return (
    <section className="rounded-xl border border-ds-border-default bg-ds-surface-2 p-4">
      <h2 className="mb-3 font-display text-[15px] font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]" style={{ fontFamily: "Arial, sans-serif", fontSize: "8pt" }}>
          <thead>
            <tr>
              {["Razón social", "Fantasía", "Domicilio", "RUT", "Servicio", "URL", "Vigencia", "Término"].map((h) => (
                <th key={h} className="border-b border-ds-border-subtle px-2 py-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1">{c.razonSocial}</td>
                <td className="px-2 py-1">{c.nombreFantasia}</td>
                <td className="px-2 py-1">{c.domicilioCasaMatriz}</td>
                <td className="px-2 py-1 font-mono">{c.rut}</td>
                <td className="px-2 py-1">{c.tipoServicio}</td>
                <td className="px-2 py-1">{c.urlFiscalizacion}</td>
                <td className="px-2 py-1">{c.vigenciaInicio ?? "—"}</td>
                <td className="px-2 py-1">{c.vigenciaTermino ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ClientesClient({ version }: { version: string }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [data, setData] = useState<{ vigentes: DtClienteArt26[]; desvinculados: DtClienteArt26[] } | null>(null);

  useEffect(() => {
    void fetch("/api/fiscalizacion-dt/sesion")
      .then((r) => r.json())
      .then((json) => {
        if (!json.session) router.replace("/fiscalizacion-dt");
        else setEmail(json.session.email);
      });
    void fetch("/api/fiscalizacion-dt/clientes")
      .then((r) => r.json())
      .then((json) => setData(json.data ?? null));
  }, [router]);

  return (
    <PortalFrame version={version} email={email}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-xl font-semibold">Clientes del prestador (Art. 26)</h1>
          <div className="flex gap-2">
            <a href="/api/fiscalizacion-dt/clientes?format=xlsx" className="ds-tap flex h-10 items-center rounded-lg border border-ds-border-default px-3 text-[13px]">
              Excel
            </a>
            <Link href="/fiscalizacion-dt/empleadores" className="ds-tap flex h-10 items-center px-3 text-[13px] text-ds-text-3">
              Volver
            </Link>
          </div>
        </div>
        {data ? (
          <>
            <Tabla title="Clientes vigentes" rows={data.vigentes} />
            <Tabla title="Ex clientes" rows={data.desvinculados} />
          </>
        ) : (
          <p className="text-[13px] text-ds-text-3">Cargando…</p>
        )}
      </div>
    </PortalFrame>
  );
}
