"use client";

/**
 * Tabs compartidos del sub-módulo "Cesiones de facturas".
 *
 * Usados en:
 *  - /finanzas/facturacion/cesiones                 → "Operaciones"
 *  - /finanzas/facturacion/cesiones/factorings      → "Empresas de factoring"
 *
 * Es un thin wrapper sobre SwipeTabs del DS v3 con dos items fijos.
 */

import { Building2, Coins } from "lucide-react";
import { SwipeTabs } from "@/components/opai-ds";

export function CesionesTabs() {
  return (
    <SwipeTabs
      items={[
        {
          href: "/finanzas/facturacion/cesiones",
          label: "Operaciones",
          icon: Coins,
          exactMatch: true,
        },
        {
          href: "/finanzas/facturacion/cesiones/factorings",
          label: "Empresas de factoring",
          icon: Building2,
        },
      ]}
    />
  );
}
