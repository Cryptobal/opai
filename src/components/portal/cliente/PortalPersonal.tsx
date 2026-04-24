"use client";

import { PortalEquipoDirectorio } from "./equipo/PortalEquipoDirectorio";

interface Props {
  isProspect?: boolean;
}

/**
 * Thin wrapper. La implementación real vive en `./equipo/PortalEquipoDirectorio`.
 * Se mantiene el export `PortalPersonal` para no romper imports existentes.
 */
export function PortalPersonal({ isProspect }: Props) {
  return <PortalEquipoDirectorio isProspect={isProspect} />;
}
