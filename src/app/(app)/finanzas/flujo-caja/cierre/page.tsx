import { redirect } from "next/navigation";

/** Ruta deprecada — el cierre semanal ahora vive en el modal de cuadratura de
 *  /finanzas/flujo-caja (bloque de cierre real/manual). Se mantiene el archivo
 *  por un sprint para no romper bookmarks existentes. */
export default function CierreRedirectPage() {
  redirect("/finanzas/flujo-caja");
}
