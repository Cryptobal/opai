import Link from 'next/link';
import { Brain } from 'lucide-react';

const settingItems = [
  {
    href: '/platform/settings/ai',
    icon: Brain,
    title: 'Proveedor de IA por defecto',
    description:
      'Configura el proveedor centralizado de IA. Los tenants pueden sobreescribir con su propia API key.',
  },
];

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Configuración Plataforma
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
              className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
            >
              <Icon className="h-5 w-5 text-gray-500 mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {item.title}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {item.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
