'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: string;
  at: string;
  email: string;
  action: string;
  tenantName: string;
  tenantRut: string;
  ip: string;
  userAgent: string;
}

export default function PlatformDtAccessLogsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load() {
    const p = new URLSearchParams();
    if (email) p.set('email', email);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const res = await fetch(`/api/platform/dt-access-logs?${p.toString()}`);
    const json = await res.json();
    setRows(json.data ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportHref = `/api/platform/dt-access-logs?format=xlsx&email=${encodeURIComponent(email)}&from=${from}&to=${to}`;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Bitácora de conexiones DT (Art. 22.5)</h1>
      <div className="flex flex-wrap gap-2">
        <input
          className="h-10 rounded border px-3 text-sm"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input type="date" className="h-10 rounded border px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="h-10 rounded border px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <button onClick={() => void load()} className="h-10 rounded bg-status-info px-4 text-sm text-white">
          Filtrar
        </button>
        <a href={exportHref} className="flex h-10 items-center rounded border px-4 text-sm">
          Excel
        </a>
      </div>
      <div className="overflow-x-auto rounded-lg border border-ds-border-default bg-ds-surface-1">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Fecha/hora', 'Correo', 'Acción', 'Empleador', 'RUT', 'IP'].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-ds-border-subtle border-ds-border-subtle">
                <td className="px-3 py-2 whitespace-nowrap">{r.at}</td>
                <td className="px-3 py-2">{r.email}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2">{r.tenantName}</td>
                <td className="px-3 py-2">{r.tenantRut}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
