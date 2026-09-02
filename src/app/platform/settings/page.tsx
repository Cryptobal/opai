import Link from 'next/link';
import { BarChart3, ListChecks } from 'lucide-react';

const settingItems = [
  {
    href: '/platform/ai/usage',
    icon: BarChart3,
    title: 'IA · Consumo',
    description:
      'Tokens y costo estimado de IA por función, modelo y empresa. Cada tenant usa su propio proveedor de IA.',
  },
  {
    href: '/platform/ai/actions',
    icon: ListChecks,
    title: 'IA · Acciones',
    description:
      'Auditoría de herramientas ejecutadas por el agente OPAI Intelligence (AiActionLog).',
  },
];

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ds-text-1">
          Configuración Plataforma
        </h1>
        <p className="mt-1 text-sm text-ds-text-3">
          Ajustes globales de OPAI que afectan a toda la plataforma.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {settingItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-ds-border-default bg-ds-surface-1 p-5 transition-colors hover:border-ds-border-strong"
            >
              <Icon className="h-5 w-5 text-ds-text-3 mb-3" />
              <h3 className="text-sm font-semibold text-ds-text-1">
                {item.title}
              </h3>
              <p className="mt-1 text-xs text-ds-text-3">
                {item.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
