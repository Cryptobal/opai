'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: string;
  checkedAt: string;
  checkedAtChile: string;
  referenceSource: string;
  referenceTime: string;
  serverTime: string;
  rttMs: number | null;
  driftMs: number | null;
  status: string;
}

function statusClass(status: string) {
  if (status === 'ok') return 'text-status-ok-fg';
  if (status === 'alert') return 'text-status-danger-fg';
  return 'text-status-warn-fg';
}

export default function PlatformSincronizacionHorariaPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const res = await fetch(`/api/platform/time-sync-logs?${p.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError('No se pudo cargar la bitácora');
        setRows([]);
        return;
      }
      setRows(json.data ?? []);
    } catch {
      setError('No se pudo cargar la bitácora');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportHref = `/api/platform/time-sync-logs?format=xlsx&from=${from}&to=${to}`;
  const last = rows?.[0] ?? null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Sincronización horaria (Art. 11)</h1>
        <p className="mt-1 text-sm text-ds-text-3">
          Verificación HTTPS contra la Hora Oficial de Chile. Retención 5 años.
        </p>
      </div>

      {last && (
        <p className={`text-sm ${statusClass(last.status)}`}>
          Último estado: {last.status} · desfase {last.driftMs ?? 'n/d'} ms · fuente{' '}
          {last.referenceSource}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          className="h-10 min-h-11 rounded border px-3 text-sm sm:min-h-10"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="date"
          className="h-10 min-h-11 rounded border px-3 text-sm sm:min-h-10"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          onClick={() => void load()}
          className="h-10 min-h-11 rounded bg-status-info px-4 text-sm text-white sm:min-h-10"
        >
          Filtrar
        </button>
        <a
          href={exportHref}
          className="flex h-10 min-h-11 items-center rounded border px-4 text-sm sm:min-h-10"
        >
          Exportar Excel
        </a>
      </div>

      {error && <p className="text-sm text-status-danger-fg">{error}</p>}
      {loading && <p className="text-sm text-ds-text-3">Cargando…</p>}
      {!loading && rows && rows.length === 0 && (
        <p className="text-sm text-ds-text-3">Sin verificaciones en el periodo</p>
      )}

      {rows && rows.length > 0 && (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white dark:bg-gray-900">
              <tr>
                {[
                  'Fecha/hora',
                  'Fuente',
                  'Hora referencia',
                  'Hora servidor',
                  'Desfase',
                  'Estado',
                ].map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="whitespace-nowrap px-3 py-2">{r.checkedAtChile}</td>
                  <td className="px-3 py-2">{r.referenceSource}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{r.referenceTime || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{r.serverTime}</td>
                  <td className="px-3 py-2">
                    {r.driftMs == null ? '—' : `${r.driftMs} ms`}
                  </td>
                  <td className={`px-3 py-2 ${statusClass(r.status)}`}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
