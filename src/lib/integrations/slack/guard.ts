/**
 * Guard de autorización para las rutas de configuración de Slack.
 * Requiere sesión NextAuth + rol admin del tenant (owner | admin).
 * Delega en el guard compartido de integraciones.
 */

import { requireIntegrationAdmin } from "@/lib/integrations/guard";

export function requireSlackAdmin() {
  return requireIntegrationAdmin("Slack");
}
