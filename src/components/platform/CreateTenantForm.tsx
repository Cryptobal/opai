'use client';

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

const generateSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Plan = 'free' | 'starter' | 'profesional' | 'enterprise';

export function CreateTenantForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [companyRut, setCompanyRut] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [plan, setPlan] = useState<Plan>('starter');
  const [trialDays, setTrialDays] = useState(30);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    setSlug(generateSlug(value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        name,
        slug,
        ownerName,
        ownerEmail,
        ownerPassword,
        plan,
      };
      if (companyRut) body.companyRut = companyRut;
      if (trialDays !== 30) body.trialDays = trialDays;

      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Error ${res.status}`);
      }

      const { tenant } = await res.json();
      router.push(`/platform/tenants/${tenant.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el tenant');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 dark:placeholder-gray-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-status-danger-fg dark:text-status-danger-fg">
          {error}
        </div>
      )}

      {/* Empresa */}
      <fieldset className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 dark:bg-gray-900 p-6">
        <legend className="px-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          Empresa
        </legend>

        <div>
          <label htmlFor="name" className={labelClass}>
            Nombre <span className="text-status-danger-fg">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={handleNameChange}
            placeholder="Mi Empresa SpA"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="slug" className={labelClass}>
            Slug <span className="text-status-danger-fg">*</span>
          </label>
          <input
            id="slug"
            type="text"
            required
            pattern="^[a-z0-9-]+$"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="mi-empresa-spa"
            className={`${inputClass} font-mono`}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Solo letras minúsculas, números y guiones</p>
        </div>

        <div>
          <label htmlFor="companyRut" className={labelClass}>
            RUT Empresa
          </label>
          <input
            id="companyRut"
            type="text"
            value={companyRut}
            onChange={(e) => setCompanyRut(e.target.value)}
            placeholder="12.345.678-9"
            className={inputClass}
          />
        </div>
      </fieldset>

      {/* Administrador Owner */}
      <fieldset className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 dark:bg-gray-900 p-6">
        <legend className="px-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          Administrador Owner
        </legend>

        <div>
          <label htmlFor="ownerName" className={labelClass}>
            Nombre <span className="text-status-danger-fg">*</span>
          </label>
          <input
            id="ownerName"
            type="text"
            required
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Juan Pérez"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="ownerEmail" className={labelClass}>
            Email <span className="text-status-danger-fg">*</span>
          </label>
          <input
            id="ownerEmail"
            type="email"
            required
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="admin@empresa.cl"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="ownerPassword" className={labelClass}>
            Contraseña <span className="text-status-danger-fg">*</span>
          </label>
          <input
            id="ownerPassword"
            type="password"
            required
            minLength={8}
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className={inputClass}
          />
        </div>
      </fieldset>

      {/* Plan */}
      <fieldset className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 dark:bg-gray-900 p-6">
        <legend className="px-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          Plan
        </legend>

        <div>
          <label htmlFor="plan" className={labelClass}>
            Plan <span className="text-status-danger-fg">*</span>
          </label>
          <select
            id="plan"
            required
            value={plan}
            onChange={(e) => setPlan(e.target.value as Plan)}
            className={inputClass}
          >
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="profesional">Profesional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        <div>
          <label htmlFor="trialDays" className={labelClass}>
            Días de prueba
          </label>
          <input
            id="trialDays"
            type="number"
            min={1}
            max={365}
            value={trialDays}
            onChange={(e) => setTrialDays(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-status-info px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-status-info focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creando...' : 'Crear Tenant'}
      </button>
    </form>
  );
}
