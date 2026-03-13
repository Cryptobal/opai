/**
 * CpqConfigTabs
 * 
 * Configuración CPQ reorganizada con pestañas:
 * - Parámetros globales
 * - Catálogo (uniformes, exámenes, alimentación, etc.)
 * - Puestos de Trabajo
 * - Cargos
 * - Roles
 */
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CpqCatalogConfig } from "@/components/cpq/CpqCatalogConfig";
import { CpqSimpleCatalogConfig } from "@/components/cpq/CpqSimpleCatalogConfig";
import { CpqTemplateConfig } from "@/components/cpq/CpqTemplateConfig";
import { CpqCostCategoryConfig } from "@/components/cpq/CpqCostCategoryConfig";
import { CpqDefaultsConfig } from "@/components/cpq/CpqDefaultsConfig";
import {
  Package,
  Briefcase,
  Award,
  Users,
  FileText,
  FolderTree,
  SlidersHorizontal,
} from "lucide-react";

const TABS = [
  {
    id: "catalogo",
    label: "Catálogo y Parámetros",
    icon: Package,
    description: "Uniformes, exámenes, equipos y parámetros globales",
  },
  {
    id: "puestos",
    label: "Puestos de Trabajo",
    icon: Briefcase,
    description: "Tipos de puesto disponibles para cotizaciones",
  },
  {
    id: "cargos",
    label: "Cargos",
    icon: Award,
    description: "Cargos asignables a posiciones",
  },
  {
    id: "roles",
    label: "Roles / Turnos",
    icon: Users,
    description: "Roles o turnos de trabajo",
  },
  {
    id: "templates",
    label: "Templates de Propuesta",
    icon: FileText,
    description: "Secciones y formato de propuestas comerciales",
  },
  {
    id: "categorias",
    label: "Categorías de Costos",
    icon: FolderTree,
    description: "Categorías para agrupar costos en propuestas",
  },
  {
    id: "defaults",
    label: "Valores por Defecto",
    icon: SlidersHorizontal,
    description: "Margen, modo de margen y template default",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CpqConfigTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("catalogo");

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === "catalogo" && (
          <CpqCatalogConfig showHeader={false} />
        )}

        {activeTab === "puestos" && (
          <CpqSimpleCatalogConfig
            title="Puestos de Trabajo"
            description="Define los tipos de puesto disponibles para las cotizaciones. Estos puestos también se muestran en el formulario web de cotización."
            apiPath="/api/cpq/puestos"
            hasDescription={false}
          />
        )}

        {activeTab === "cargos" && (
          <CpqSimpleCatalogConfig
            title="Cargos"
            description="Define los cargos asignables a cada posición en una cotización (ej: Guardia, Supervisor, Jefe de Grupo)."
            apiPath="/api/cpq/cargos"
            hasDescription={true}
          />
        )}

        {activeTab === "roles" && (
          <CpqSimpleCatalogConfig
            title="Roles / Turnos"
            description="Define los roles o turnos de trabajo disponibles (ej: 4x4 = 4 trabajo, 4 descanso). Estos patrones se usan en la pauta mensual para pintar series."
            apiPath="/api/cpq/roles"
            hasDescription={true}
            hasPattern={true}
          />
        )}

        {activeTab === "templates" && <CpqTemplateConfig />}
        {activeTab === "categorias" && <CpqCostCategoryConfig />}
        {activeTab === "defaults" && <CpqDefaultsConfig />}
      </div>
    </div>
  );
}
