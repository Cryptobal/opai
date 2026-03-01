import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { resolvePermissions } from "@/lib/permissions-server";
import { canView, hasModuleAccess } from "@/lib/permissions";
import Link from "next/link";
import {
  Users,
  Plug,
  PenLine,
  FolderTree,
  TrendingUp,
  Calculator,
  DollarSign,
  ChevronRight,
  Bell,
  Building,
  ClipboardList,
  ShieldCheck,
  Bot,
  Brain,
  ClipboardCheck,
  Receipt,
  Ticket,
  Shield,
} from "lucide-react";
import { ConfigSearch } from "@/components/configuracion/ConfigSearch";

type ConfigItem = {
  submodule: string;
  href: string;
  title: string;
  description: string;
  icon: typeof Users;
  /** Si true, solo visible para owner/admin (ej: gestión de roles) */
  adminOnly?: boolean;
};

type ConfigSection = {
  key: string;
  title: string;
  items: ConfigItem[];
};

const CONFIG_SECTIONS: ConfigSection[] = [
  {
    key: "general",
    title: "General",
    items: [
      {
        submodule: "usuarios",
        href: "/opai/configuracion/empresa",
        title: "Datos de la Empresa",
        description: "Razón social, RUT, dirección, representante legal — para documentos laborales",
        icon: Building,
        adminOnly: true,
      },
      {
        submodule: "usuarios",
        href: "/opai/configuracion/usuarios",
        title: "Usuarios",
        description: "Gestión de usuarios y asignación de roles",
        icon: Users,
      },
      {
        submodule: "usuarios",
        href: "/opai/configuracion/roles",
        title: "Roles y Permisos",
        description: "Configurar permisos por módulo y submódulo",
        icon: ShieldCheck,
        adminOnly: true,
      },
      {
        submodule: "grupos",
        href: "/opai/configuracion/grupos",
        title: "Grupos",
        description: "Grupos organizacionales para cadenas de aprobación",
        icon: Users,
      },
      {
        submodule: "integraciones",
        href: "/opai/configuracion/integraciones",
        title: "Integraciones",
        description: "Gmail y conectores externos",
        icon: Plug,
      },
      {
        submodule: "notificaciones",
        href: "/opai/configuracion/notificaciones",
        title: "Notificaciones",
        description: "Parámetros globales. Preferencias por usuario en Perfil",
        icon: Bell,
      },
      {
        submodule: "ia",
        href: "/opai/configuracion/inteligencia-artificial",
        title: "Inteligencia Artificial",
        description: "Proveedor, modelo y API keys para funciones de IA",
        icon: Brain,
        adminOnly: true,
      },
      {
        submodule: "notificaciones",
        href: "/opai/configuracion/asistente-ia",
        title: "Asistente IA (Chat)",
        description: "Control de roles, acceso y alcance del chat",
        icon: Bot,
        adminOnly: true,
      },
      {
        submodule: "usuarios",
        href: "/opai/configuracion/auditoria",
        title: "Auditoría",
        description: "Registro de acciones y cambios por usuario",
        icon: ClipboardCheck,
        adminOnly: true,
      },
    ],
  },
  {
    key: "correos-documentos",
    title: "Correos y Documentos",
    items: [
      {
        submodule: "firmas",
        href: "/opai/configuracion/firmas",
        title: "Firmas",
        description: "Firmas para correos salientes",
        icon: PenLine,
      },
      {
        submodule: "categorias",
        href: "/opai/configuracion/categorias-plantillas",
        title: "Categorías de plantillas",
        description: "Categorías por módulo para Gestión Documental",
        icon: FolderTree,
      },
    ],
  },
  {
    key: "modulos",
    title: "Módulos",
    items: [
      {
        submodule: "crm",
        href: "/opai/configuracion/crm",
        title: "CRM",
        description: "Pipeline y automatizaciones",
        icon: TrendingUp,
      },
      {
        submodule: "cpq",
        href: "/opai/configuracion/cpq",
        title: "Cotizaciones (CPQ)",
        description: "Catálogo, parámetros y pricing",
        icon: DollarSign,
      },
      {
        submodule: "payroll",
        href: "/opai/configuracion/payroll",
        title: "Payroll",
        description: "Parámetros legales y versiones",
        icon: Calculator,
      },
      {
        submodule: "ops",
        href: "/opai/configuracion/ops",
        title: "Operaciones",
        description: "Marcaciones, emails automáticos y parámetros",
        icon: ClipboardList,
      },
      {
        submodule: "tipos_ticket",
        href: "/opai/configuracion/tipos-ticket",
        title: "Tipos de Ticket",
        description: "Solicitudes, cadenas de aprobación y SLA",
        icon: Ticket,
      },
      {
        submodule: "finanzas",
        href: "/opai/configuracion/finanzas",
        title: "Finanzas",
        description: "Ítems de rendición, kilometraje, aprobadores y reglas",
        icon: Receipt,
      },
    ],
  },
];

export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion");
  }

  const role = session.user.role;
  const perms = await resolvePermissions({
    role,
    roleTemplateId: session.user.roleTemplateId,
  });

  if (!hasModuleAccess(perms, "config")) {
    redirect("/hub");
  }

  const isAdmin = role === "owner" || role === "admin";

  const visibleSections = CONFIG_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      return canView(perms, "config", item.submodule);
    }),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Administración global y por módulo"
      />

      <div className="space-y-6 min-w-0">
        <ConfigSearch />

        <div className="rounded-xl border border-border bg-card/70 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {visibleSections.map((section) => (
              <a
                key={section.key}
                href={`#config-section-${section.key}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
              >
                <span>{section.title}</span>
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums">
                  {section.items.length}
                </span>
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border border-border bg-card/70 p-3">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Navegación
              </p>
              <div className="space-y-1">
                {visibleSections.map((section) => (
                  <a
                    key={section.key}
                    href={`#config-section-${section.key}`}
                    className="flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <span>{section.title}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground/80">
                      {section.items.length}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            {visibleSections.map((section) => (
              <section key={section.key} id={`config-section-${section.key}`} className="scroll-mt-24">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {section.title}
                </h2>
                <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/40 active:bg-accent/60 group"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Portal del Guardia — enlace externo */}
        {isAdmin && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              Portales Externos
            </h2>
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              <Link
                href="/portal/guardia"
                target="_blank"
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/40 active:bg-accent/60 group"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Shield className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    Portal del Guardia
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Portal de autoservicio para guardias — tickets, pautas, marcaciones y perfil
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
              Comparte la URL <code className="bg-muted px-1 py-0.5 rounded">/portal/guardia</code> con tus guardias. Se autentican con RUT + PIN.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
