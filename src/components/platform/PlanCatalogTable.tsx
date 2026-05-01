'use client';

import { useState, useEffect, useCallback } from 'react';

interface Plan {
  id: string;
  slug: string;
  name: string;
  pricePerGuard: number;
  baseMinimum: number;
  maxGuards: number;
  maxAdmins: number;
  includedModules: string[];
  featured: boolean;
  active: boolean;
}

type EditableField = 'pricePerGuard' | 'baseMinimum' | 'maxGuards' | 'maxAdmins';

export function PlanCatalogTable() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/catalog/plans');
      if (!res.ok) throw new Error('Failed to fetch plans');
      const data = await res.json();
      setPlans(data.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  async function patchPlan(id: string, body: Record<string, unknown>) {
    setSaving(id);
    try {
      const res = await fetch(`/api/platform/catalog/plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update plan');
      const data = await res.json();
      setPlans((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                ...data.plan,
                pricePerGuard: Number(data.plan.pricePerGuard),
                baseMinimum: Number(data.plan.baseMinimum),
              }
            : p,
        ),
      );
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(null);
    }
  }

  function startEdit(id: string, field: EditableField, currentValue: number) {
    setEditingCell({ id, field });
    setEditValue(String(currentValue));
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string, field: EditableField) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const numVal = Number(editValue);
      if (!isNaN(numVal)) {
        patchPlan(id, { [field]: numVal });
      }
      setEditingCell(null);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }

  function toggleField(id: string, field: 'featured' | 'active', current: boolean) {
    patchPlan(id, { [field]: !current });
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: !current } : p)));
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading plans...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-status-danger-fg dark:text-status-danger-fg">{error}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800">
            <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
            <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Price/Guard (UF)</th>
            <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Min Mensual (UF)</th>
            <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Max Guards</th>
            <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Max Admins</th>
            <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Featured</th>
            <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Active</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {plans.map((plan) => (
            <tr key={plan.id} className={saving === plan.id ? 'opacity-60' : ''}>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900 dark:text-gray-100">{plan.name}</div>
                {plan.includedModules.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {plan.includedModules.map((mod) => (
                      <span
                        key={mod}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      >
                        {mod}
                      </span>
                    ))}
                  </div>
                )}
              </td>

              {(['pricePerGuard', 'baseMinimum', 'maxGuards', 'maxAdmins'] as EditableField[]).map(
                (field) => (
                  <td key={field} className="px-4 py-3">
                    {editingCell?.id === plan.id && editingCell?.field === field ? (
                      <input
                        type="number"
                        step={field === 'pricePerGuard' || field === 'baseMinimum' ? '0.01' : '1'}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, plan.id, field)}
                        onBlur={() => setEditingCell(null)}
                        autoFocus
                        className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(plan.id, field, plan[field])}
                        className="rounded px-1 py-0.5 text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                      >
                        {field === 'pricePerGuard' || field === 'baseMinimum'
                          ? plan[field].toFixed(4)
                          : plan[field]}
                      </button>
                    )}
                  </td>
                ),
              )}

              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={plan.featured}
                  onChange={() => toggleField(plan.id, 'featured', plan.featured)}
                  className="h-4 w-4 accent-teal-500"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={plan.active}
                  onChange={() => toggleField(plan.id, 'active', plan.active)}
                  className="h-4 w-4 accent-teal-500"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {plans.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No plans found.</div>
      )}
    </div>
  );
}
