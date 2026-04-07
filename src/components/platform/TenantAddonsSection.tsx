'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ── Types ──

interface TenantPlanData {
  plan: string;
  maxGuards: number;
  maxAdmins: number;
  maxStorageMb: number;
  basePrice: number;
  pricePerGuard: number;
  customPricePerGuard: number | null;
  customBaseMinimum: number | null;
  currency: string;
  billingStatus: string;
  trialEndsAt: string | null;
}

interface TenantMetrics {
  activeGuards: number;
  totalGuards: number;
  activePuestos: number;
  marcaciones30d: number;
  documentos30d: number;
  rondas30d: number;
}

interface TenantDetailResponse {
  tenant: { id: string; name: string };
  plan: TenantPlanData | null;
  metrics: TenantMetrics;
}

interface ActiveAddon {
  id: string;
  addonSlug: string;
  addonName: string;
  addonTag: string | null;
  pricingModel: string;
  catalogPrice: number;
  priceUnit: string | null;
  customPrice: number | null;
  effectivePrice: number;
  packId: string | null;
}

interface AvailableAddon {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pricingModel: string;
  priceAmount: number;
  priceUnit: string | null;
  moduleKey: string | null;
  tag: string | null;
  isActive: boolean;
}

interface PackWithStatus {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  addonSlugs: string[];
  discountPct: number;
  applied: boolean;
}

interface AddonsResponse {
  activeAddons: ActiveAddon[];
  availableAddons: AvailableAddon[];
  packs: PackWithStatus[];
}

interface CatalogPlan {
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

interface PlansResponse {
  plans: CatalogPlan[];
}

// ── Helpers ──

function formatUF(value: number): string {
  return value.toFixed(2);
}

const PLAN_SLUGS = ['free', 'starter', 'profesional', 'enterprise'] as const;

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  starter: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  profesional: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  enterprise: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

const MODULE_LABELS: Record<string, { name: string; category: string }> = {
  hub: { name: 'Hub (Dashboard)', category: 'Core' },
  config: { name: 'Configuración', category: 'Core' },
  portal_guardia: { name: 'Portal Guardia', category: 'Core' },
  portal_marcacion: { name: 'Portal Marcación', category: 'Core' },
  ops_asistencia: { name: 'Asistencia', category: 'Core' },
  ops_pauta: { name: 'Pautas', category: 'Core' },
  personas: { name: 'Personas', category: 'Core' },
  tickets: { name: 'Tickets', category: 'Core' },
  ops_pce: { name: 'PCE', category: 'Operaciones' },
  ops_turnos_extra: { name: 'Turnos Extra', category: 'Operaciones' },
  ops_refuerzos: { name: 'Refuerzos', category: 'Operaciones' },
  ops_onboarding: { name: 'Onboarding Digital', category: 'Operaciones' },
  ops_audit: { name: 'Log de Auditoría', category: 'Operaciones' },
  documentos: { name: 'Documentos', category: 'Operaciones' },
  contratos: { name: 'Contratos', category: 'Operaciones' },
  portal_supervisor: { name: 'Portal Supervisor', category: 'Operaciones' },
  ops_supervision: { name: 'Supervisión de Campo GPS', category: 'Profesional' },
  alertas_cobertura: { name: 'Alertas de Cobertura', category: 'Profesional' },
  chat: { name: 'Chat Real-time', category: 'Profesional' },
  gamificacion: { name: 'Gamificación', category: 'Profesional' },
  protocolos_ia: { name: 'Protocolos IA', category: 'Profesional' },
  reportes_dt: { name: 'Reportes DT', category: 'Profesional' },
  crm: { name: 'CRM Comercial', category: 'Add-ons' },
  cpq: { name: 'CPQ (Cotizador)', category: 'Add-ons' },
  ops_rondas: { name: 'Rondas GPS', category: 'Add-ons' },
  ops_inventario: { name: 'Inventario', category: 'Add-ons' },
  portal_cliente: { name: 'Portal Cliente', category: 'Add-ons' },
  payroll: { name: 'Payroll / Nómina', category: 'Add-ons' },
  finanzas: { name: 'Finanzas + DTE', category: 'Add-ons' },
  ats: { name: 'ATS / Reclutamiento', category: 'Add-ons' },
  face_id: { name: 'Face ID Biométrico', category: 'Add-ons' },
  ia_operacional: { name: 'IA Operacional', category: 'Add-ons' },
  control_acceso: { name: 'Control de Acceso', category: 'Add-ons' },
  fiscalizacion: { name: 'Fiscalización DT', category: 'Add-ons' },
  control_nocturno: { name: 'Control Nocturno IA', category: 'Add-ons' },
  white_label: { name: 'White-label', category: 'Add-ons' },
  app_nativa: { name: 'App iOS/Android', category: 'Add-ons' },
};

const MODULE_CATEGORIES = ['Core', 'Operaciones', 'Profesional', 'Add-ons'] as const;

const TAG_COLORS: Record<string, string> = {
  operacional: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  comercial: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  financiero: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  premium: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

// ── Component ──

export function TenantAddonsSection({ tenantId }: { tenantId: string }) {
  const [tenantData, setTenantData] = useState<TenantDetailResponse | null>(null);
  const [addonsData, setAddonsData] = useState<AddonsResponse | null>(null);
  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  // Custom override draft state
  const [draftPricePerGuard, setDraftPricePerGuard] = useState('');
  const [draftBaseMinimum, setDraftBaseMinimum] = useState('');
  const [draftMaxGuards, setDraftMaxGuards] = useState('');
  const [draftMaxAdmins, setDraftMaxAdmins] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);

  // Custom addon price drafts
  const [addonPriceDrafts, setAddonPriceDrafts] = useState<Record<string, string>>({});
  const [editingAddonPrice, setEditingAddonPrice] = useState<string | null>(null);

  // Plan switch preview
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [tenantRes, addonsRes, plansRes] = await Promise.all([
        fetch(`/api/platform/tenants/${tenantId}`),
        fetch(`/api/platform/tenants/${tenantId}/addons`),
        fetch(`/api/platform/catalog/plans`),
      ]);

      if (!tenantRes.ok || !addonsRes.ok || !plansRes.ok) {
        throw new Error('Error al cargar datos');
      }

      const [tenant, addons, plans] = await Promise.all([
        tenantRes.json() as Promise<TenantDetailResponse>,
        addonsRes.json() as Promise<AddonsResponse>,
        plansRes.json() as Promise<PlansResponse>,
      ]);

      setTenantData(tenant);
      setAddonsData(addons);
      setPlansData(plans);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Sync drafts when data loads
  useEffect(() => {
    if (tenantData?.plan) {
      setDraftPricePerGuard(
        tenantData.plan.customPricePerGuard != null
          ? String(tenantData.plan.customPricePerGuard)
          : '',
      );
      setDraftBaseMinimum(
        tenantData.plan.customBaseMinimum != null
          ? String(tenantData.plan.customBaseMinimum)
          : '',
      );
      setDraftMaxGuards(String(tenantData.plan.maxGuards));
      setDraftMaxAdmins(String(tenantData.plan.maxAdmins));
    }
  }, [tenantData]);

  // ── Mutations ──

  const patchPlan = useCallback(
    async (fields: Record<string, unknown>) => {
      setMutating(true);
      try {
        await fetch(`/api/platform/tenants/${tenantId}/plan`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        await fetchAll();
      } finally {
        setMutating(false);
      }
    },
    [tenantId, fetchAll],
  );

  const toggleAddon = useCallback(
    async (slug: string, activate: boolean, customPrice?: number) => {
      setMutating(true);
      try {
        if (activate) {
          await fetch(`/api/platform/tenants/${tenantId}/addons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addonSlug: slug, customPrice }),
          });
        } else {
          await fetch(`/api/platform/tenants/${tenantId}/addons?addon=${slug}`, {
            method: 'DELETE',
          });
        }
        await fetchAll();
      } finally {
        setMutating(false);
      }
    },
    [tenantId, fetchAll],
  );

  const applyPack = useCallback(
    async (packSlug: string) => {
      setMutating(true);
      try {
        await fetch(`/api/platform/tenants/${tenantId}/addons/pack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packSlug }),
        });
        await fetchAll();
      } finally {
        setMutating(false);
      }
    },
    [tenantId, fetchAll],
  );

  const saveAddonCustomPrice = useCallback(
    async (slug: string, price: number) => {
      setMutating(true);
      try {
        await fetch(`/api/platform/tenants/${tenantId}/addons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addonSlug: slug, customPrice: price }),
        });
        await fetchAll();
      } finally {
        setMutating(false);
        setEditingAddonPrice(null);
      }
    },
    [tenantId, fetchAll],
  );

  // ── Billing Calculation ──

  const billing = useMemo(() => {
    if (!tenantData?.plan || !addonsData || !plansData) return null;

    const plan = tenantData.plan;
    const guards = tenantData.metrics.activeGuards;
    const catalogPlan = plansData.plans.find((p) => p.slug === plan.plan);

    // Effective plan pricing
    const effectivePricePerGuard =
      plan.customPricePerGuard ?? catalogPlan?.pricePerGuard ?? plan.pricePerGuard;
    const effectiveBaseMinimum =
      plan.customBaseMinimum ?? catalogPlan?.baseMinimum ?? plan.basePrice;

    const planCalc = effectivePricePerGuard * guards;
    const planPrice = Math.max(planCalc, effectiveBaseMinimum);

    // Addon prices
    const addonLines: { name: string; amount: number; detail: string }[] = [];
    let addonTotal = 0;

    for (const active of addonsData.activeAddons) {
      let amount: number;
      let detail: string;

      if (active.pricingModel === 'per_guard') {
        amount = active.effectivePrice * guards;
        detail = `UF ${formatUF(active.effectivePrice)} x ${guards} guardias`;
      } else if (active.pricingModel === 'flat') {
        amount = active.effectivePrice;
        detail = `UF ${formatUF(active.effectivePrice)}/mes`;
      } else {
        amount = active.effectivePrice;
        detail = `UF ${formatUF(active.effectivePrice)}/unidad`;
      }

      addonLines.push({ name: active.addonName, amount, detail });
      addonTotal += amount;
    }

    // Pack discounts
    let packDiscountTotal = 0;
    const packDiscountLines: { name: string; amount: number; pct: number }[] = [];

    for (const pack of addonsData.packs) {
      if (!pack.applied || pack.discountPct <= 0) continue;

      // Sum prices of addons in this pack
      let packAddonSum = 0;
      for (const slug of pack.addonSlugs) {
        const active = addonsData.activeAddons.find((a) => a.addonSlug === slug);
        if (active) {
          if (active.pricingModel === 'per_guard') {
            packAddonSum += active.effectivePrice * guards;
          } else {
            packAddonSum += active.effectivePrice;
          }
        }
      }

      const discount = packAddonSum * (pack.discountPct / 100);
      if (discount > 0) {
        packDiscountLines.push({ name: pack.name, amount: discount, pct: pack.discountPct });
        packDiscountTotal += discount;
      }
    }

    const total = planPrice + addonTotal - packDiscountTotal;

    return {
      planName: catalogPlan?.name ?? plan.plan,
      effectivePricePerGuard,
      effectiveBaseMinimum,
      guards,
      planCalc,
      planPrice,
      addonLines,
      addonTotal,
      packDiscountLines,
      packDiscountTotal,
      total,
    };
  }, [tenantData, addonsData, plansData]);

  // ── Included modules for current plan ──

  const includedModules = useMemo(() => {
    if (!plansData || !tenantData?.plan) return new Set<string>();
    const catalogPlan = plansData.plans.find((p) => p.slug === tenantData.plan?.plan);
    return new Set(catalogPlan?.includedModules ?? []);
  }, [plansData, tenantData]);

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !tenantData || !addonsData || !plansData) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
        {error || 'No se pudieron cargar los datos'}
      </div>
    );
  }

  const plan = tenantData.plan;

  if (!plan) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center text-gray-500 dark:text-gray-400">
        Este tenant no tiene un plan configurado.
      </div>
    );
  }

  const catalogPlan = plansData.plans.find((p) => p.slug === plan.plan);

  return (
    <div className="space-y-6">
      {/* Mutating overlay */}
      {mutating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        </div>
      )}

      {/* ── Section 1: Plan ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Plan actual</h3>

        {/* Current plan badge */}
        <div className="mb-4">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
              PLAN_BADGE_COLORS[plan.plan] || 'bg-gray-100 text-gray-700'
            }`}
          >
            {catalogPlan?.name ?? plan.plan}
          </span>
        </div>

        {/* Plan change buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {PLAN_SLUGS.map((slug) => {
            const isCurrent = plan.plan === slug;
            const isSelected = selectedPlanSlug === slug;
            return (
              <button
                key={slug}
                onClick={() => setSelectedPlanSlug(isCurrent ? null : slug)}
                disabled={mutating}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  isCurrent
                    ? 'bg-teal-600 text-white'
                    : isSelected
                      ? 'bg-teal-100 text-teal-800 ring-2 ring-teal-500 dark:bg-teal-900 dark:text-teal-200'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {slug} {isCurrent && '✓'}
              </button>
            );
          })}
          {selectedPlanSlug && selectedPlanSlug !== plan.plan && (
            <>
              <button
                onClick={() => {
                  patchPlan({ plan: selectedPlanSlug });
                  setSelectedPlanSlug(null);
                }}
                disabled={mutating}
                className="ml-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Confirmar cambio a {selectedPlanSlug}
              </button>
              <button
                onClick={() => setSelectedPlanSlug(null)}
                className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400"
              >
                Cancelar
              </button>
            </>
          )}
        </div>

        {/* Custom overrides */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Price per guard */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              Precio por guardia (UF)
            </label>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              Catalogo: UF {formatUF(catalogPlan?.pricePerGuard ?? plan.pricePerGuard)}
            </div>
            {editingField === 'pricePerGuard' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  className="w-32 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                  value={draftPricePerGuard}
                  onChange={(e) => setDraftPricePerGuard(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => {
                    const val = draftPricePerGuard ? Number(draftPricePerGuard) : null;
                    patchPlan({ customPricePerGuard: val });
                    setEditingField(null);
                  }}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setDraftPricePerGuard(
                      plan.customPricePerGuard != null ? String(plan.customPricePerGuard) : '',
                    );
                    setEditingField(null);
                  }}
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                onClick={() => setEditingField('pricePerGuard')}
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {plan.customPricePerGuard != null
                    ? `UF ${formatUF(plan.customPricePerGuard)} (custom)`
                    : 'Usar catalogo'}
                </span>
                <span className="text-xs text-blue-600">Editar</span>
              </div>
            )}
          </div>

          {/* Base minimum */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              Minimo mensual (UF)
            </label>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              Catalogo: UF {formatUF(catalogPlan?.baseMinimum ?? plan.basePrice)}
            </div>
            {editingField === 'baseMinimum' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  className="w-32 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                  value={draftBaseMinimum}
                  onChange={(e) => setDraftBaseMinimum(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => {
                    const val = draftBaseMinimum ? Number(draftBaseMinimum) : null;
                    patchPlan({ customBaseMinimum: val });
                    setEditingField(null);
                  }}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setDraftBaseMinimum(
                      plan.customBaseMinimum != null ? String(plan.customBaseMinimum) : '',
                    );
                    setEditingField(null);
                  }}
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                onClick={() => setEditingField('baseMinimum')}
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {plan.customBaseMinimum != null
                    ? `UF ${formatUF(plan.customBaseMinimum)} (custom)`
                    : 'Usar catalogo'}
                </span>
                <span className="text-xs text-blue-600">Editar</span>
              </div>
            )}
          </div>

          {/* Max guards */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              Max guardias
            </label>
            {editingField === 'maxGuards' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="w-32 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                  value={draftMaxGuards}
                  onChange={(e) => setDraftMaxGuards(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => {
                    patchPlan({ maxGuards: Number(draftMaxGuards) });
                    setEditingField(null);
                  }}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setDraftMaxGuards(String(plan.maxGuards));
                    setEditingField(null);
                  }}
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                onClick={() => setEditingField('maxGuards')}
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">{plan.maxGuards}</span>
                <span className="text-xs text-blue-600">Editar</span>
              </div>
            )}
          </div>

          {/* Max admins */}
          <div>
            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              Max admins
            </label>
            {editingField === 'maxAdmins' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="w-32 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                  value={draftMaxAdmins}
                  onChange={(e) => setDraftMaxAdmins(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => {
                    patchPlan({ maxAdmins: Number(draftMaxAdmins) });
                    setEditingField(null);
                  }}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setDraftMaxAdmins(String(plan.maxAdmins));
                    setEditingField(null);
                  }}
                  className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-400"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                onClick={() => setEditingField('maxAdmins')}
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">{plan.maxAdmins}</span>
                <span className="text-xs text-blue-600">Editar</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 1b: Plan → Features Matrix ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Matriz de features por plan
        </h3>
        {(() => {
          const planMap = new Map<string, CatalogPlan>(
            plansData.plans.map((p) => [p.slug, p] as const),
          );
          const currentSlug = plan.plan;
          const previewSlug = selectedPlanSlug && selectedPlanSlug !== currentSlug ? selectedPlanSlug : null;
          const currentSet = new Set<string>(planMap.get(currentSlug)?.includedModules ?? []);
          const previewSet: Set<string> | null = previewSlug
            ? new Set<string>(planMap.get(previewSlug)?.includedModules ?? [])
            : null;

          return (
            <>
              {previewSlug && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs">
                  <div className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    Vista previa de cambio: {currentSlug} → {previewSlug}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div>
                      <span className="text-green-700 dark:text-green-400 font-medium">+ Ganan:</span>{' '}
                      {Array.from(previewSet!)
                        .filter((m) => !currentSet.has(m))
                        .map((m) => MODULE_LABELS[m]?.name ?? m)
                        .join(', ') || '—'}
                    </div>
                    <div>
                      <span className="text-red-700 dark:text-red-400 font-medium">− Pierden:</span>{' '}
                      {Array.from(currentSet)
                        .filter((m) => !previewSet!.has(m))
                        .map((m) => MODULE_LABELS[m]?.name ?? m)
                        .join(', ') || '—'}
                    </div>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                        Módulo
                      </th>
                      {PLAN_SLUGS.map((slug) => {
                        const isCurrent = slug === currentSlug;
                        const isPreview = slug === previewSlug;
                        return (
                          <th
                            key={slug}
                            className={`p-2 text-center text-xs font-semibold capitalize ${
                              isCurrent
                                ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 border-x-2 border-teal-500'
                                : isPreview
                                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-x-2 border-amber-400'
                                  : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {slug}
                            {isCurrent && (
                              <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400">
                                ACTIVO
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_CATEGORIES.flatMap((cat) => {
                      const modulesInCat = Object.entries(MODULE_LABELS).filter(
                        ([, info]) => info.category === cat,
                      );
                      return [
                          <tr key={`cat-${cat}`}>
                            <td
                              colSpan={PLAN_SLUGS.length + 1}
                              className="bg-gray-100 dark:bg-gray-800 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300"
                            >
                              {cat}
                            </td>
                          </tr>
                          ,
                          ...modulesInCat.map(([key, info]) => (
                            <tr
                              key={key}
                              className="border-b border-gray-100 dark:border-gray-800"
                            >
                              <td className="p-2 text-gray-700 dark:text-gray-300">
                                {info.name}
                              </td>
                              {PLAN_SLUGS.map((slug) => {
                                const included = (
                                  planMap.get(slug)?.includedModules ?? []
                                ).includes(key);
                                const isCurrent = slug === currentSlug;
                                const isPreview = slug === previewSlug;
                                return (
                                  <td
                                    key={slug}
                                    className={`p-2 text-center ${
                                      isCurrent
                                        ? 'bg-teal-50/60 dark:bg-teal-950/20 border-x-2 border-teal-500'
                                        : isPreview
                                          ? 'bg-amber-50/60 dark:bg-amber-950/20 border-x-2 border-amber-400'
                                          : ''
                                    }`}
                                  >
                                    {included ? (
                                      <span className="text-teal-600 dark:text-teal-400 font-bold">
                                        ✓
                                      </span>
                                    ) : (
                                      <span className="text-gray-300 dark:text-gray-700">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          )),
                        ];
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Section 2: Add-ons ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Add-ons</h3>
        <div className="space-y-2">
          {addonsData.availableAddons.map((addon) => {
            const activeAddon = addonsData.activeAddons.find((a) => a.addonSlug === addon.slug);
            const isIncludedInPlan = addon.moduleKey != null && includedModules.has(addon.moduleKey);

            return (
              <div
                key={addon.slug}
                className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                {/* Toggle */}
                <input
                  type="checkbox"
                  checked={addon.isActive}
                  onChange={() => toggleAddon(addon.slug, !addon.isActive)}
                  disabled={mutating}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />

                {/* Name */}
                <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">
                  {addon.name}
                </span>

                {/* Tag badge */}
                {addon.tag && (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      TAG_COLORS[addon.tag] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {addon.tag}
                  </span>
                )}

                {/* Included in plan badge */}
                {isIncludedInPlan && (
                  <span className="bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded text-xs font-medium">
                    INCLUIDO EN PLAN
                  </span>
                )}

                {/* Price */}
                <div className="flex items-center gap-2 text-right min-w-[180px] justify-end">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    UF {formatUF(addon.priceAmount)}
                    {addon.pricingModel === 'per_guard'
                      ? '/guardia'
                      : addon.pricingModel === 'flat'
                        ? '/mes'
                        : addon.priceUnit ? `/${addon.priceUnit}` : ''}
                  </span>
                  {addon.isActive && (
                    <>
                      {editingAddonPrice === addon.slug ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            className="w-20 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-1 py-0.5 text-xs"
                            value={addonPriceDrafts[addon.slug] ?? ''}
                            onChange={(e) =>
                              setAddonPriceDrafts((prev) => ({
                                ...prev,
                                [addon.slug]: e.target.value,
                              }))
                            }
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const val = addonPriceDrafts[addon.slug];
                              if (val) {
                                saveAddonCustomPrice(addon.slug, Number(val));
                              }
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => setEditingAddonPrice(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setAddonPriceDrafts((prev) => ({
                              ...prev,
                              [addon.slug]: activeAddon?.customPrice != null
                                ? String(activeAddon.customPrice)
                                : '',
                            }));
                            setEditingAddonPrice(addon.slug);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {activeAddon?.customPrice != null
                            ? `custom: UF ${formatUF(activeAddon.customPrice)}`
                            : 'precio custom'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Packs ── */}
      {addonsData.packs.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Packs</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {addonsData.packs.map((pack) => {
              // Calculate savings
              let packAddonSum = 0;
              for (const slug of pack.addonSlugs) {
                const avail = addonsData.availableAddons.find((a) => a.slug === slug);
                if (avail) {
                  if (avail.pricingModel === 'per_guard') {
                    packAddonSum += avail.priceAmount * tenantData.metrics.activeGuards;
                  } else {
                    packAddonSum += avail.priceAmount;
                  }
                }
              }
              const savings = packAddonSum * (pack.discountPct / 100);

              return (
                <div
                  key={pack.slug}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {pack.name}
                    </h4>
                    {pack.applied ? (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Activo
                      </span>
                    ) : (
                      <button
                        onClick={() => applyPack(pack.slug)}
                        disabled={mutating}
                        className="rounded bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        Aplicar pack
                      </button>
                    )}
                  </div>
                  {pack.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {pack.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {pack.addonSlugs.map((slug) => {
                      const addon = addonsData.availableAddons.find((a) => a.slug === slug);
                      return (
                        <span
                          key={slug}
                          className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-gray-600 dark:text-gray-400"
                        >
                          {addon?.name ?? slug}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-medium text-teal-600 dark:text-teal-400">
                      -{pack.discountPct}% descuento
                    </span>
                    {savings > 0 && (
                      <span className="text-gray-500 dark:text-gray-400">
                        Ahorro: UF {formatUF(savings)}/mes
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 4: Billing Summary ── */}
      {billing && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Resumen de facturacion mensual
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {/* Plan line */}
              <tr>
                <td className="py-1.5 text-gray-700 dark:text-gray-300">
                  Plan {billing.planName}: UF {formatUF(billing.effectivePricePerGuard)} x{' '}
                  {billing.guards} guardias = UF {formatUF(billing.planCalc)}
                  {billing.effectiveBaseMinimum > 0 && (
                    <span className="text-gray-400 dark:text-gray-500">
                      {' '}(min UF {formatUF(billing.effectiveBaseMinimum)})
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">
                  UF {formatUF(billing.planPrice)}
                </td>
              </tr>

              {/* Addon lines */}
              {billing.addonLines.map((line) => (
                <tr key={line.name}>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300">
                    <span className="text-gray-400 dark:text-gray-500">+</span> {line.name}:{' '}
                    <span className="text-gray-400 dark:text-gray-500">{line.detail}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    UF {formatUF(line.amount)}
                  </td>
                </tr>
              ))}

              {/* Pack discount lines */}
              {billing.packDiscountLines.map((line) => (
                <tr key={line.name}>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300">
                    <span className="text-red-400">-</span> {line.name} (-{line.pct}%)
                  </td>
                  <td className="py-1.5 text-right font-mono text-red-600 dark:text-red-400 whitespace-nowrap">
                    -UF {formatUF(line.amount)}
                  </td>
                </tr>
              ))}

              {/* Separator */}
              <tr>
                <td colSpan={2} className="py-1">
                  <div className="border-t border-gray-200 dark:border-gray-700" />
                </td>
              </tr>

              {/* Total */}
              <tr>
                <td className="py-2 font-semibold text-gray-900 dark:text-gray-100">
                  Total mensual estimado
                </td>
                <td className="py-2 text-right font-mono font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap text-base">
                  UF {formatUF(billing.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
