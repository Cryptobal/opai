import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { canView, hasModuleAccess } from "@/lib/permissions";
import { ConfigHomeClient } from "@/components/configuracion/ConfigHomeClient";

type ConfigItem = {
  submodule: string;
  href: string;
  title: string;
  description: string;
  icon: string;
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
      { submodule: "empresa", href: "/opai/configuracion/empresa", title: "Datos de la Empresa", description: "Razón social, RUT, dirección, representante legal", icon: "building", adminOnly: true },
      { submodule: "usuarios", href: "/opai/configuracion/usuarios", title: "Usuarios", description: "Gestión de usuarios y asignación de roles", icon: "users" },
      { submodule: "roles", href: "/opai/configuracion/roles", title: "Roles y Permisos", description: "Configurar permisos por módulo y submódulo", icon: "shield-check", adminOnly: true },
      { submodule: "grupos", href: "/opai/configuracion/grupos", title: "Grupos", description: "Grupos organizacionales para cadenas de aprobación", icon: "users" },
      { submodule: "integraciones", href: "/opai/configuracion/integraciones", title: "Integraciones", description: "Gmail y conectores externos", icon: "plug" },
      { submodule: "notificaciones", href: "/opai/configuracion/notificaciones", title: "Notificaciones", description: "Parámetros globales", icon: "bell" },
      { submodule: "auditoria", href: "/opai/configuracion/auditoria", title: "Auditoría", description: "Registro de acciones y cambios por usuario", icon: "clipboard-check", adminOnly: true },
      { submodule: "documentos_operacionales", href: "/opai/configuracion/documentos-operacionales", title: "Documentos Operacionales", description: "OS10, seguros, documentos por instalación, guardias", icon: "file-text", adminOnly: true },
      { submodule: "mi_plan", href: "/opai/configuracion/mi-plan", title: "Mi Plan", description: "Plan actual, módulos, add-ons y solicitar upgrade", icon: "credit-card", adminOnly: true },
    ],
  },
  {
    key: "inteligencia-artificial",
    title: "Inteligencia Artificial",
    items: [
      {
        submodule: "asistente_ia",
        href: "/opai/configuracion/asistente-ia",
        title: "Asistente IA",
        description: "Control de roles, acceso y alcance del chat conversacional",
        icon: "bot",
        adminOnly: true,
      },
      {
        submodule: "inteligencia_artificial",
        href: "/opai/configuracion/inteligencia-artificial",
        title: "Proveedores de IA",
        description: "Conecta tu propia API key (OpenAI, Anthropic, Google) y elige el modelo",
        icon: "key-round",
        adminOnly: true,
      },
    ],
  },
  {
    key: "correos-documentos",
    title: "Correos y Documentos",
    items: [
      { submodule: "firmas", href: "/opai/configuracion/firmas", title: "Firmas", description: "Firmas para correos salientes", icon: "pen-line" },
      { submodule: "categorias", href: "/opai/configuracion/categorias-plantillas", title: "Categorías de plantillas", description: "Categorías por módulo para Gestión Documental", icon: "folder-tree" },
      { submodule: "categorias", href: "/opai/documentos/templates?module=whatsapp", title: "Mensajes WhatsApp", description: "Edita las plantillas de WhatsApp que se envían desde el CRM, CPQ, Operaciones y Portal Cliente", icon: "message-circle" },
    ],
  },
  {
    key: "compliance",
    title: "Compliance",
    items: [
      { submodule: "cumplimiento", href: "/opai/configuracion/cumplimiento", title: "Cumplimiento (Ley 21.719)", description: "Contacto del DPO y estado del DPA", icon: "shield-check", adminOnly: true },
    ],
  },
  {
    key: "modulos",
    title: "Módulos",
    items: [
      { submodule: "crm", href: "/opai/configuracion/crm", title: "CRM", description: "Pipeline y automatizaciones", icon: "trending-up" },
      { submodule: "cpq", href: "/opai/configuracion/cpq", title: "Cotizaciones (CPQ)", description: "Catálogo, parámetros y pricing", icon: "dollar-sign" },
      { submodule: "payroll", href: "/opai/configuracion/payroll", title: "Payroll", description: "Parámetros legales y versiones", icon: "calculator" },
      { submodule: "ops", href: "/opai/configuracion/ops", title: "Operaciones", description: "Marcaciones, emails y parámetros", icon: "clipboard-list" },
      { submodule: "tipos_ticket", href: "/opai/configuracion/tipos-ticket", title: "Tipos de Ticket", description: "Solicitudes, aprobación y SLA", icon: "ticket" },
      { submodule: "finanzas", href: "/opai/configuracion/finanzas", title: "Finanzas", description: "Rendiciones, kilometraje y reglas", icon: "receipt" },
      { submodule: "gamificacion", href: "/opai/configuracion/gamificacion", title: "Gamificación", description: "Pesos, niveles, puntos y badges", icon: "trophy", adminOnly: true },
      { submodule: "alertas_cobertura", href: "/opai/configuracion/alertas-cobertura", title: "Alertas de Cobertura", description: "Oleadas, tiempos y canales", icon: "siren" },
      { submodule: "ats", href: "/opai/configuracion/ats", title: "ATS — Reclutamiento", description: "Match score, canales y distribución", icon: "briefcase" },
      { submodule: "psicolaboral", href: "/opai/configuracion/psicolaboral", title: "Psicolaboral", description: "Pesos, umbrales y plantillas de invitación", icon: "brain", adminOnly: true },
      { submodule: "conocimiento", href: "/opai/configuracion/conocimiento", title: "Conocimiento", description: "Frecuencia de exámenes recurrentes, recordatorios y deadlines", icon: "graduation-cap" },
      { submodule: "informes_vulnerabilidad", href: "/opai/configuracion/informes-vulnerabilidad", title: "Informes de Vulnerabilidad", description: "Configura las secciones de informes generados por IA", icon: "shield-alert", adminOnly: true },
    ],
  },
];

export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/opai/configuracion");

  const role = session.user.role;
  const perms = await resolvePermissions({ role, roleTemplateId: session.user.roleTemplateId });
  if (!hasModuleAccess(perms, "config")) redirect("/hub");

  const isAdmin = role === "owner" || role === "admin";

  // Visibilidad la decide únicamente `canView` sobre el rol/template.
  // El flag `adminOnly` queda solo como pista visual ("Admin") en la UI,
  // no como bloqueador. Las páginas individuales tienen sus propios guards.
  const visibleSections = CONFIG_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      canView(perms, "config", item.submodule),
    ),
  })).filter((section) => section.items.length > 0);

  return <ConfigHomeClient sections={visibleSections} isAdmin={isAdmin} />;
}
