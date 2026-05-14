/**
 * Alcance multitenant estable para consultas keyed por instalación tras
 * requireAccessControlAuth(installationId).
 *
 * Filtra por la relación FK → CrmInstallation.tenantId en lugar del tenant_id
 * desnormalizado de la tabla hija cuando exista ese patrón, para que datos
 * legacy con tenant_id inconsistente sign visibles igual que antes del endurecimiento.
 */

export type InstallationTenantScope = {
  installationId: string;
  installation: { tenantId: string };
};

export function installationTenantScope(
  installationId: string,
  tenantId: string,
): InstallationTenantScope {
  return {
    installationId,
    installation: { tenantId },
  };
}
