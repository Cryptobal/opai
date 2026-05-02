'use client';

import { useEffect, useState, useCallback } from 'react';

interface PlanInfo {
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

interface AddonInfo {
  slug: string;
  name: string;
  price: number;
  priceUnit: string | null;
}

interface CatalogPlan {
  slug: string;
  name: string;
  headline: string | null;
  description: string | null;
  pricePerGuard: number;
  baseMinimum: number;
  maxGuards: number;
  maxAdmins: number;
  includedModules: string[];
  featured: boolean;
}

interface PlanData {
  plan: PlanInfo | null;
  modules: string[];
  addons: AddonInfo[];
  planCatalog: CatalogPlan[];
}

const planOrder = ['free', 'starter', 'profesional', 'enterprise'];

const planBadge: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  starter: 'bg-status-info-soft text-status-info-fg',
  profesional: 'bg-status-info-soft text-status-info-fg',
  enterprise: 'bg-tint-violet text-tint-violet-fg',
};

const MODULE_LABELS: Record<string, string> = {
  hub: 'Hub', config: 'Configuracion', portal_guardia: 'Portal Guardia',
  portal_marcacion: 'Portal Marcacion', ops_asistencia: 'Asistencia',
  ops_pauta: 'Pauta', ops_pce: 'PCE', ops_turnos_extra: 'Turnos Extra',
  ops_refuerzos: 'Refuerzos', ops_onboarding: 'Onboarding', ops_audit: 'Auditoria',
  personas: 'Personas', tickets: 'Tickets', documentos: 'Documentos',
  contratos: 'Contratos', ops_supervision: 'Supervision',
  alertas_cobertura: 'Alertas Cobertura', chat: 'Chat', gamificacion: 'Gamificacion',
  protocolos_ia: 'Protocolos IA', reportes_dt: 'Reportes DT', crm: 'CRM',
  cpq: 'CPQ', ops_rondas: 'Rondas', ops_inventario: 'Inventario',
  portal_cliente: 'Portal Cliente', payroll: 'Payroll', finanzas: 'Finanzas',
  ats: 'ATS / Reclutamiento', face_id: 'Face ID', ia_operacional: 'IA Operacional',
  control_acceso: 'Control Acceso', fiscalizacion: 'Fiscalizacion',
  control_nocturno: 'Control Nocturno', white_label: 'White-label', app_nativa: 'App Nativa',
};

export function MiPlanClient() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState<{ type: 'plan' | 'addon'; value: string } | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch('/api/tenant/plan')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const sendRequest = useCallback(async () => {
    if (!upgradeModal) return;
    setSending(true);
    try {
      await fetch('/api/tenant/plan/upgrade-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedPlan: upgradeModal.type === 'plan' ? upgradeModal.value : undefined,
          requestedAddons: upgradeModal.type === 'addon' ? [upgradeModal.value] : undefined,
          message: upgradeMessage,
        }),
      });
      setSent(true);
      setTimeout(() => {
        setUpgradeModal(null);
        setSent(false);
        setUpgradeMessage('');
      }, 2000);
    } finally {
      setSending(false);
    }
  }, [upgradeModal, upgradeMessage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-status-info border-t-transparent" />
      </div>
    );
  }

  if (!data?.plan) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-8 text-center text-gray-500">
        No hay un plan configurado para tu cuenta.
      </div>
    );
  }

  const { plan, modules, addons, planCatalog } = data;
  const currentPlanIdx = planOrder.indexOf(plan.plan);
  const effectivePrice = plan.customPricePerGuard ?? plan.pricePerGuard;
  const effectiveBase = plan.customBaseMinimum ?? plan.basePrice;
  const addonTotal = addons.reduce((sum, a) => sum + a.price, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Mi Plan</h1>

      {/* Current plan card */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Plan {plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1)}
              </h2>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${planBadge[plan.plan] ?? 'bg-gray-100 text-gray-700'}`}>
                {plan.billingStatus}
              </span>
            </div>
            {plan.trialEndsAt && (
              <p className="mt-1 text-sm text-status-warn-fg">
                Trial hasta {new Date(plan.trialEndsAt).toLocaleDateString('es-CL')}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {effectivePrice > 0 ? `${effectivePrice} ${plan.currency}` : 'Gratis'}
            </p>
            {effectivePrice > 0 && <p className="text-xs text-gray-500">por guardia/mes</p>}
            {effectiveBase > 0 && (
              <p className="text-xs text-gray-500">Base minima: {effectiveBase} {plan.currency}</p>
            )}
          </div>
        </div>

        {/* Limits */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Guardias</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.maxGuards === 9999 ? 'Sin limite' : plan.maxGuards}</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Admins</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.maxAdmins}</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Almacenamiento</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.maxStorageMb >= 10000 ? `${plan.maxStorageMb / 1000} GB` : `${plan.maxStorageMb} MB`}</p>
          </div>
        </div>
      </div>

      {/* Enabled modules */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
        <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Modulos incluidos</h3>
        <div className="flex flex-wrap gap-2">
          {modules.map((m) => (
            <span key={m} className="rounded-full bg-status-ok-soft px-3 py-1 text-xs font-medium text-status-ok-fg">
              {MODULE_LABELS[m] ?? m}
            </span>
          ))}
        </div>
      </div>

      {/* Active add-ons */}
      {addons.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Add-ons activos</h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {addons.map((a) => (
              <div key={a.slug} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-900 dark:text-gray-100">{a.name}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {a.price > 0 ? `${a.price} UF/${a.priceUnit ?? 'mes'}` : 'Incluido'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly estimate */}
      <div className="rounded-xl border border-status-info-border bg-status-info-soft/30 p-6">
        <h3 className="mb-2 text-lg font-semibold text-status-info-fg">Estimacion mensual</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-status-info-fg">
            <span>Plan base</span>
            <span>{effectiveBase > 0 ? `${effectiveBase} ${plan.currency}` : 'Gratis'}</span>
          </div>
          {addonTotal > 0 && (
            <div className="flex justify-between text-status-info-fg">
              <span>Add-ons</span>
              <span>{addonTotal} UF</span>
            </div>
          )}
          <div className="flex justify-between border-t border-status-info-border pt-1 font-semibold text-status-info-fg">
            <span>Total estimado</span>
            <span>{effectiveBase + addonTotal} {plan.currency}</span>
          </div>
          <p className="text-xs text-status-info-fg dark:text-status-info-fg">
            * El costo por guardia ({effectivePrice} {plan.currency}/guardia) se suma segun guardias activos.
          </p>
        </div>
      </div>

      {/* Plan comparison */}
      {planCatalog.length > 0 && currentPlanIdx < planOrder.length - 1 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Planes disponibles</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {planCatalog.map((cp) => {
              const isCurrent = cp.slug === plan.plan;
              const isHigher = planOrder.indexOf(cp.slug) > currentPlanIdx;
              return (
                <div
                  key={cp.slug}
                  className={`rounded-lg border p-4 ${
                    isCurrent
                      ? 'border-status-info-border bg-status-info-soft/30'
                      : cp.featured
                        ? 'border-status-info-border'
                        : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">{cp.name}</h4>
                    {isCurrent && (
                      <span className="rounded-full bg-status-info-soft px-2 py-0.5 text-xs font-medium text-status-info-fg">
                        Actual
                      </span>
                    )}
                    {cp.featured && !isCurrent && (
                      <span className="rounded-full bg-status-info-soft px-2 py-0.5 text-xs font-medium text-status-info-fg">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{cp.headline}</p>
                  <p className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                    {cp.pricePerGuard > 0 ? `${cp.pricePerGuard} UF` : 'Gratis'}
                    {cp.pricePerGuard > 0 && <span className="text-xs font-normal text-gray-500">/guardia</span>}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Hasta {cp.maxGuards === 9999 ? 'ilimitados' : cp.maxGuards} guardias
                  </p>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    {cp.includedModules.length} modulos incluidos
                  </p>
                  {isHigher && (
                    <button
                      type="button"
                      onClick={() => setUpgradeModal({ type: 'plan', value: cp.slug })}
                      className="mt-3 w-full rounded-lg bg-status-info px-3 py-2 text-xs font-medium text-white hover:brightness-110 transition-colors"
                    >
                      Solicitar upgrade
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upgrade modal */}
      {upgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-6 shadow-xl">
            {sent ? (
              <div className="text-center">
                <p className="text-lg font-semibold text-status-ok-fg">Solicitud enviada</p>
                <p className="mt-1 text-sm text-gray-500">Nuestro equipo se pondra en contacto contigo.</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Solicitar {upgradeModal.type === 'plan' ? `plan ${upgradeModal.value}` : `add-on ${upgradeModal.value}`}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Tu solicitud sera revisada por nuestro equipo. Te contactaremos para coordinar la activacion.
                </p>
                <textarea
                  className="mt-4 w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Mensaje opcional..."
                  value={upgradeMessage}
                  onChange={(e) => setUpgradeMessage(e.target.value)}
                />
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradeModal(null);
                      setUpgradeMessage('');
                    }}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={sendRequest}
                    disabled={sending}
                    className="rounded-lg bg-status-info px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {sending ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
