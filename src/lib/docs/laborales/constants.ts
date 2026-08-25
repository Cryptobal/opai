export const LABORAL_MODULE = "laboral" as const;

export const LABORAL_CATEGORIES = [
  { key: "odi", label: "ODI — Obligación de Informar" },
  { key: "das", label: "Derecho a Saber (D.S. 40)" },
  { key: "epp", label: "Entrega de EPP" },
  { key: "contrato", label: "Contrato de trabajo" },
  { key: "anexo", label: "Anexo de contrato" },
  { key: "riohs", label: "RIOHS" },
  { key: "otro_laboral", label: "Otro" },
] as const;

export const TEMPLATE_SIGNER_ROLES = [
  "trabajador",
  "rep_legal",
  "prevencionista",
  "supervisor_instalacion",
  "usuario",
  "email_externo",
] as const;

export type TemplateSignerRole = (typeof TEMPLATE_SIGNER_ROLES)[number];

export const TEMPLATE_SIGNER_ROLE_LABELS: Record<TemplateSignerRole, string> = {
  trabajador: "Trabajador",
  rep_legal: "Representante legal",
  prevencionista: "Prevencionista",
  supervisor_instalacion: "Supervisor de instalación",
  usuario: "Usuario OPAI",
  email_externo: "Email externo",
};

export const TENANT_SIGNER_ROLES = ["rep_legal", "prevencionista"] as const;
export type TenantSignerRole = (typeof TENANT_SIGNER_ROLES)[number];

export const SCOPE_TYPES = ["none", "global_active", "installations"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const SIGNING_MODES = ["sequential", "parallel"] as const;

export const CONDITION_OP_LABELS: Record<string, string> = {
  "==": "es",
  "!=": "no es",
  ">": "mayor que",
  "<": "menor que",
  ">=": "mayor o igual",
  "<=": "menor o igual",
  truthy: "tiene valor",
  empty: "está vacío",
};
