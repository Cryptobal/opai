'use client';

/**
 * Dashboard Content
 * 
 * Wrapper client component para manejar estados interactivos
 */

import { useState } from 'react';
import { Presentation, Template, PresentationView } from '@prisma/client';
import { AppNavigation } from '@/components/layout/AppNavigation';
import { StatsCards } from './StatsCards';
import { PresentationsList } from './PresentationsList';
import { ConversionChart } from './ConversionChart';

type PresentationWithRelations = Presentation & {
  template: Template;
  views: PresentationView[];
};

interface DashboardContentProps {
  presentations: PresentationWithRelations[];
  stats: {
    total: number;
    sent: number;
    viewed: number;
    pending: number;
    opened: number;
    clicked: number;
    totalViews: number;
    totalOpens: number;
    totalClicks: number;
  };
  conversionRate: number;
  openRate: number;
  clickRate: number;
  userRole?: string;
}

export function DashboardContent({
  presentations,
  stats,
  conversionRate,
  openRate,
  clickRate,
  userRole,
}: DashboardContentProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Navegación Principal */}
      <AppNavigation userRole={userRole} presentations={presentations} />

      {/* Main Content - simplificado */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Solo Presentations List */}
        <PresentationsList 
          presentations={presentations}
          initialFilter={activeFilter}
        />
      </main>
    </div>
  );
}
