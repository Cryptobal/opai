'use client';

import { useState, useEffect, useCallback } from 'react';

interface Addon {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pricingModel: string;
  priceAmount: number;
  priceUnit: string | null;
  moduleKey: string | null;
  tag: string | null;
  active: boolean;
}

const TAG_ORDER = ['Operacional', 'Comercial', 'Financiero', 'Premium'];

export function AddonCatalogTable() {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchAddons = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/catalog/addons');
      if (!res.ok) throw new Error('Failed to fetch add-ons');
      const data = await res.json();
      setAddons(data.addons);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddons();
  }, [fetchAddons]);

  async function patchAddon(id: string, body: Record<string, unknown>) {
    setSaving(id);
    try {
      const res = await fetch(`/api/platform/catalog/addons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update add-on');
      const data = await res.json();
      setAddons((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, ...data.addon, priceAmount: Number(data.addon.priceAmount) } : a,
        ),
      );
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(null);
    }
  }

  function startEditPrice(id: string, currentPrice: number) {
    setEditingCell(id);
    setEditValue(String(currentPrice));
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const numVal = Number(editValue);
      if (!isNaN(numVal)) {
        patchAddon(id, { priceAmount: numVal });
      }
      setEditingCell(null);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }

  function toggleActive(id: string, current: boolean) {
    patchAddon(id, { active: !current });
    setAddons((prev) => prev.map((a) => (a.id === id ? { ...a, active: !current } : a)));
  }

  // Group addons by tag
  const grouped = addons.reduce<Record<string, Addon[]>>((acc, addon) => {
    const tag = addon.tag || 'Other';
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(addon);
    return acc;
  }, {});

  const sortedTags = [
    ...TAG_ORDER.filter((t) => grouped[t]),
    ...Object.keys(grouped).filter((t) => !TAG_ORDER.includes(t)),
  ];

  const modelLabel: Record<string, string> = {
    per_guard: 'Per Guard',
    flat: 'Flat',
    per_unit: 'Per Unit',
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading add-ons...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {sortedTags.map((tag) => (
        <div key={tag}>
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{tag}</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Model</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Price (UF)</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Unit</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Module</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {grouped[tag].map((addon) => (
                  <tr key={addon.id} className={saving === addon.id ? 'opacity-60' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {addon.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {modelLabel[addon.pricingModel] || addon.pricingModel}
                    </td>
                    <td className="px-4 py-3">
                      {editingCell === addon.id ? (
                        <input
                          type="number"
                          step="0.0001"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, addon.id)}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                          className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditPrice(addon.id, addon.priceAmount)}
                          className="rounded px-1 py-0.5 text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                        >
                          {addon.priceAmount.toFixed(4)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {addon.priceUnit || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      {addon.moduleKey ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {addon.moduleKey}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">\u2014</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={addon.active}
                        onChange={() => toggleActive(addon.id, addon.active)}
                        className="h-4 w-4 accent-teal-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {addons.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No add-ons found.</div>
      )}
    </div>
  );
}
