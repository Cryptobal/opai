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
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<(string | null)[]>([]);
  const [exporting, setExporting] = useState(false);

  async function load(
    next: string | null,
    filters: { from: string; to: string } = { from: appliedFrom, to: appliedTo },
  ) {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (filters.from) p.set('from', filters.from);
      if (filters.to) p.set('to', filters.to);
      if (next) p.set('cursor', next);
      const res = await fetch(`/api/platform/time-sync-logs?${p.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError('No se pudo cargar la bitácora');
        setRows([]);
        return;
      }
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
      setNextCursor(json.nextCursor ?? null);
    } catch {
      setError('No se pudo cargar la bitácora');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(null, { from: '', to: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilter() {
    setAppliedFrom(from);
    setAppliedTo(to);
    setCursor(null);
    setPrevCursors([]);
    void load(null, { from, to });
  }

  function goNext() {
    if (!nextCursor) return;
    setPrevCursors((stack) => [...stack, cursor]);
    setCursor(nextCursor);
    void load(nextCursor, { from: appliedFrom, to: appliedTo });
  }

  function goPrev() {
    const stack = [...prevCursors];
    const prev = stack.pop() ?? null;
    setPrevCursors(stack);
    setCursor(prev);
    void load(prev, { from: appliedFrom, to: appliedTo });
  }

  async function exportExcel() {
    setExporting(true);
    setError(null);
    try {
      const p = new URLSearchParams({ format: 'xlsx' });
      if (appliedFrom) p.set('from', appliedFrom);
      if (appliedTo) p.set('to', appliedTo);
      const res = await fetch(`/api/platform/time-sync-logs?${p.toString()}`);
      if (res.status === 413) {
        const json = await res.json().catch(() => null);
        setError(json?.error || 'El periodo es demasiado grande. Acota las fechas.');
        return;
      }
      if (!res.ok) {
        setError('No se pudo exportar el Excel');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sincronizacion-horaria.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo exportar el Excel');
    } finally {
      setExporting(false);
    }
  }

  const last = rows?.[0] ?? null;
  const PAGE_SIZE = 200;
  const pageStart = prevCursors.length * PAGE_SIZE + (rows && rows.length > 0 ? 1 : 0);
  const pageEnd = prevCursors.length * PAGE_SIZE + (rows?.length ?? 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Sincronización horaria (Art. 11)</h1>
        <p className="mt-1 text-sm text-ds-text-3">
          Verificación HTTPS contra la Hora Oficial de Chile. Retención 5 años. El Excel
          descarga el periodo filtrado completo.
        </p>
      </div>

      {last && !cursor && (
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
          onClick={applyFilter}
          className="h-10 min-h-11 rounded bg-status-info px-4 text-sm text-white sm:min-h-10"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={() => void exportExcel()}
          disabled={exporting}
          className="flex h-10 min-h-11 items-center rounded border px-4 text-sm sm:min-h-10"
        >
          {exporting ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      {error && <p className="text-sm text-status-danger-fg">{error}</p>}
      {loading && <p className="text-sm text-ds-text-3">Cargando…</p>}
      {!loading && rows && rows.length === 0 && (
        <p className="text-sm text-ds-text-3">Sin verificaciones en el periodo</p>
      )}

      {rows && rows.length > 0 && (
        <p className="text-[12px] text-ds-text-3">
          Mostrando {pageStart}–{pageEnd} de {total.toLocaleString('es-CL')}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-ds-border-default bg-ds-surface-1">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-ds-surface-1">
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
                <tr key={r.id} className="border-t border-ds-border-subtle border-ds-border-subtle">
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

      {(prevCursors.length > 0 || nextCursor) && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={prevCursors.length === 0 || loading}
            className="h-10 min-h-11 rounded border px-4 text-sm disabled:opacity-50 sm:min-h-10"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!nextCursor || loading}
            className="h-10 min-h-11 rounded border px-4 text-sm disabled:opacity-50 sm:min-h-10"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
