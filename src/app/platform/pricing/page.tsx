'use client';

import { useState } from 'react';
import { PlanCatalogTable } from '@/components/platform/PlanCatalogTable';
import { AddonCatalogTable } from '@/components/platform/AddonCatalogTable';
import { PackCatalogCards } from '@/components/platform/PackCatalogCards';

const tabs = [
  { key: 'plans', label: 'Planes' },
  { key: 'addons', label: 'Add-ons' },
  { key: 'packs', label: 'Packs' },
];

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState('plans');

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Pricing</h1>

      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'plans' && <PlanCatalogTable />}
      {activeTab === 'addons' && <AddonCatalogTable />}
      {activeTab === 'packs' && <PackCatalogCards />}
    </div>
  );
}
