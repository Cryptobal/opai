import Link from "next/link";
import { SectionHeader } from "@/components/opai-ds";
import { HubMobileViewPicker } from "./HubMobileViewPicker";

/** Botón pill hacia el módulo real (ej. "Abrir Comercial" → /crm). */
export function HubModuleLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-full border border-primary/30 bg-primary/10 px-4 text-ds-body font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </Link>
  );
}

/**
 * Header compartido de las vistas del Centro de Control (/hub/[view]).
 *
 * Patrón único para Comercial/Operaciones/Finanzas/Personas/Payroll/Docs:
 * selector móvil de vistas (bajo lg) + header compacto con acción hacia el
 * módulo real. La terminología distingue "Control comercial" (dashboard del
 * Hub) de "Abrir Comercial" (módulo CRM).
 */
export function HubDomainHeader({
  title,
  hint,
  moduleHref,
  moduleLabel,
}: {
  title: string;
  hint: string;
  moduleHref: string;
  moduleLabel: string;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <HubMobileViewPicker />
      <SectionHeader
        title={title}
        hint={hint}
        actions={<HubModuleLink href={moduleHref}>{moduleLabel}</HubModuleLink>}
        size="lg"
      />
    </div>
  );
}
