import type { ReactNode } from "react";

/**
 * Layout del Hub.
 *
 * Las vistas del Hub (Resumen / Comercial / Operaciones / …) viven en los tabs
 * de la barra superior (AppShell). El PageHero de bienvenida se retiró por
 * decisión del owner: el saludo ("Buenos días"), el subtítulo ("Centro de
 * comando"), la descripción y las píldoras de integraciones (Gmail/Calendar/
 * Drive) resultaban redundantes con los accesos rápidos y la barra superior.
 * El contenido de la vista arranca directo en los accesos directos.
 */
export default function HubLayout({ children }: { children: ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}
