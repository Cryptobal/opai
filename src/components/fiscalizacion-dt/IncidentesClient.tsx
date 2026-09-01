"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PortalFrame } from "./PortalFrame";
import { EMPTY_INCIDENTES_MESSAGE } from "@/modules/reportes-dt/constants";

type Row = {
  id: string;
  startedAt: string;
  endedAt: string;
  severity: string;
  description: string;
  tenantName: string;
};

export function IncidentesClient({ version }: { version: string }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void fetch("/api/fiscalizacion-dt/sesion")
      .then((r) => r.json())
      .then((json) => {
        if (!json.session) router.replace("/fiscalizacion-dt");
        else setEmail(json.session.email);
      });
    void fetch("/api/fiscalizacion-dt/incidentes")
      .then((r) => r.json())
      .then((json) => setRows(json.data?.rows ?? []));
  }, [router]);

  return (
    <PortalFrame version={version} email={email}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-xl font-semibold">Incidentes técnicos</h1>
          <div className="flex gap-2">
            <a href="/api/fiscalizacion-dt/incidentes?format=xlsx" className="ds-tap flex h-10 items-center rounded-lg border border-ds-border-default px-3 text-[13px]">
              Excel
            </a>
            <a href="/api/fiscalizacion-dt/incidentes?format=pdf" className="ds-tap flex h-10 items-center rounded-lg border border-ds-border-default px-3 text-[13px]">
              PDF
            </a>
            <a href="/api/fiscalizacion-dt/incidentes?format=docx" className="ds-tap flex h-10 items-center rounded-lg border border-ds-border-default px-3 text-[13px]">
              Word
            </a>
            <Link href="/fiscalizacion-dt/empleadores" className="ds-tap flex h-10 items-center px-3 text-[13px] text-ds-text-3">
              Volver
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ds-border-default bg-ds-surface-2 p-4">
          {!rows ? (
            <p className="text-[13px] text-ds-text-3">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px]">{EMPTY_INCIDENTES_MESSAGE}</p>
          ) : (
            <table className="w-full min-w-[640px] text-left" style={{ fontFamily: "Arial, sans-serif", fontSize: "8pt" }}>
              <thead>
                <tr>
                  {["Inicio", "Término", "Alcance", "Descripción", "Empleador"].map((h) => (
                    <th key={h} className="border-b border-ds-border-subtle px-2 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1">{r.startedAt}</td>
                    <td className="px-2 py-1">{r.endedAt || "—"}</td>
                    <td className="px-2 py-1">{r.severity}</td>
                    <td className="px-2 py-1">{r.description}</td>
                    <td className="px-2 py-1">{r.tenantName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PortalFrame>
  );
}
