import Link from "next/link";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/opai-ds";
import { getModuleDef } from "@/lib/modules/registry";

type PageProps = {
  searchParams: Promise<{ m?: string; from?: string }>;
};

export default async function ModuloNoDisponiblePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const moduleKey = typeof params.m === "string" ? params.m : "";
  const moduleLabel = getModuleDef(moduleKey)?.label ?? (moduleKey || "este módulo");

  return (
    <div className="ds-page-enter mx-auto flex min-h-[60dvh] w-full max-w-lg items-center px-4 py-10">
      <EmptyState
        icon={<Lock className="h-6 w-6" aria-hidden />}
        tone="warn"
        title={`${moduleLabel} no está en tu plan`}
        description={
          <>
            Este módulo no está incluido en el plan de tu empresa.
            Si lo necesitas, contacta a tu administrador para solicitar un upgrade.
          </>
        }
        action={
          <Link
            href="/hub"
            className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground"
          >
            Volver al Hub
          </Link>
        }
        secondary={
          <Link
            href="/opai/configuracion/mi-plan"
            className="inline-flex h-11 min-w-[44px] items-center justify-center px-3 text-[13px] font-medium text-ds-text-2 underline-offset-4 hover:underline"
          >
            Contactar al administrador
          </Link>
        }
      />
    </div>
  );
}
