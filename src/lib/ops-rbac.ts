import { ROLE_POLICIES, type OpsCapability } from "./role-policy";

export type { OpsCapability };

const ROLE_OPS_CAPABILITIES: Record<string, OpsCapability[]> = {
  owner: ROLE_POLICIES.owner.opsCapabilities,
  admin: ROLE_POLICIES.admin.opsCapabilities,
  editor: ROLE_POLICIES.editor.opsCapabilities,
  rrhh: ROLE_POLICIES.rrhh.opsCapabilities,
  operaciones: ROLE_POLICIES.operaciones.opsCapabilities,
  reclutamiento: ROLE_POLICIES.reclutamiento.opsCapabilities,
  solo_ops: ROLE_POLICIES.solo_ops.opsCapabilities,
  solo_crm: ROLE_POLICIES.solo_crm.opsCapabilities,
  solo_documentos: ROLE_POLICIES.solo_documentos.opsCapabilities,
  solo_payroll: ROLE_POLICIES.solo_payroll.opsCapabilities,
  supervisor: ROLE_POLICIES.supervisor.opsCapabilities,
  viewer: ROLE_POLICIES.viewer.opsCapabilities,
};

export function hasOpsCapability(role: string, capability: OpsCapability): boolean {
  return (ROLE_OPS_CAPABILITIES[role] || []).includes(capability);
}
