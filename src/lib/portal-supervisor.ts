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
  accountName?: string | null;
  address?: string | null;
  status?: string | null;
  pairingCode?: string | null;
}

export interface SupervisorSession {
  id: string;
  name: string;
  installations: SupervisorInstallation[];
}
