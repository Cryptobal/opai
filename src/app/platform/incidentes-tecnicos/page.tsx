'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Row {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  startedAt: string;
  endedAt: string | null;
  description: string;
  severity: string;
  createdBy: string;
}

export default function PlatformIncidentesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('parcial');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');

  async function load() {
    const res = await fetch('/api/platform/incidentes-tecnicos');
    const json = await res.json();
    setRows(json.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const res = await fetch('/api/platform/incidentes-tecnicos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        severity,
        startedAt: startedAt || new Date().toISOString(),
        endedAt: endedAt || null,
      }),
    });
    if (!res.ok) {
      toast.error('No se pudo registrar el incidente');
      return;
    }
    toast.success('Incidente registrado');
    setDescription('');
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold">Incidentes técnicos (Art. 27 f)</h1>
      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-2">
        <textarea
          className="min-h-24 rounded border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          placeholder="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="space-y-2">
          <select
            className="h-10 w-full rounded border border-gray-300 px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="parcial">Parcial</option>
            <option value="total">Total</option>
          </select>
          <input type="datetime-local" className="h-10 w-full rounded border px-2 text-sm" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          <input type="datetime-local" className="h-10 w-full rounded border px-2 text-sm" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
          <button onClick={() => void create()} className="h-10 rounded bg-status-info px-4 text-sm text-white">
            Registrar
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Inicio', 'Término', 'Alcance', 'Descripción', 'Empleador', 'Registró'].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2">{r.startedAt}</td>
                <td className="px-3 py-2">{r.endedAt || '—'}</td>
                <td className="px-3 py-2">{r.severity}</td>
                <td className="px-3 py-2">{r.description}</td>
                <td className="px-3 py-2">{r.tenantName || 'Plataforma'}</td>
                <td className="px-3 py-2">{r.createdBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
