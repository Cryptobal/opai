'use client';

import { useState, useEffect, useCallback } from 'react';

interface Pack {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  addonSlugs: string[];
  discountPct: number;
  active: boolean;
}

export function PackCatalogCards() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPacks = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/catalog/packs');
      if (!res.ok) throw new Error('Failed to fetch packs');
      const data = await res.json();
      setPacks(data.packs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  async function patchPack(id: string, body: Record<string, unknown>) {
    setSaving(id);
    try {
      const res = await fetch(`/api/platform/catalog/packs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update pack');
      const data = await res.json();
      setPacks((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...data.pack, discountPct: Number(data.pack.discountPct) } : p,
        ),
      );
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(null);
    }
  }

  function startEditDiscount(id: string, current: number) {
    setEditingDiscount(id);
    setEditValue(String(current));
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const numVal = Number(editValue);
      if (!isNaN(numVal)) {
        patchPack(id, { discountPct: numVal });
      }
      setEditingDiscount(null);
    } else if (e.key === 'Escape') {
      setEditingDiscount(null);
    }
  }

  function toggleActive(id: string, current: boolean) {
    patchPack(id, { active: !current });
    setPacks((prev) => prev.map((p) => (p.id === id ? { ...p, active: !current } : p)));
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading packs...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</div>;
  }

  if (packs.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No packs found.</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {packs.map((pack) => (
        <div
          key={pack.id}
          className={`rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 ${
            saving === pack.id ? 'opacity-60' : ''
          }`}
        >
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{pack.name}</h3>
              {pack.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{pack.description}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              Active
              <input
                type="checkbox"
                checked={pack.active}
                onChange={() => toggleActive(pack.id, pack.active)}
                className="h-4 w-4 accent-teal-500"
              />
            </label>
          </div>

          <div className="mb-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Add-ons:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {pack.addonSlugs.length > 0 ? (
                pack.addonSlugs.map((slug) => (
                  <span
                    key={slug}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  >
                    {slug}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-600">None</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Discount:</span>
            {editingDiscount === pack.id ? (
              <input
                type="number"
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, pack.id)}
                onBlur={() => setEditingDiscount(null)}
                autoFocus
                className="w-20 rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            ) : (
              <button
                type="button"
                onClick={() => startEditDiscount(pack.id, pack.discountPct)}
                className="rounded px-1 py-0.5 text-sm font-medium text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                {pack.discountPct}%
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
