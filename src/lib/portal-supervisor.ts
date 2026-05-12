/**
 * Tipos compartidos del portal de supervisor.
 *
 * Stub mínimo para destrabar el build de Vercel — los componentes del
 * portal supervisor (en `src/components/portal/supervisor/`) importan
 * estos tipos pero el archivo nunca llegó al repo. La forma se deriva
 * de los accesos (`installation.id`, `installation.name`, etc.) que
 * hacen los componentes consumidores.
 */

export interface SupervisorInstallation {
  id: string;
  name: string;
  accountId?: string | null;
  accountName?: string | null;
  address?: string | null;
  status?: string | null;
  pairingCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  geoRadiusM?: number | null;
  teMontoClp?: number | null;
}

export interface SupervisorSession {
  id: string;
  name: string;
  installations: SupervisorInstallation[];
}
