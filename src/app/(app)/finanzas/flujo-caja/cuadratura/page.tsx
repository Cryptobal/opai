import { redirect } from "next/navigation";

/** Ruta deprecada — la cuadratura ahora vive como modal en /finanzas/flujo-caja
 *  (se abre desde "Cuadrar y cerrar" en cada columna). Se mantiene el archivo
 *  por un sprint para no romper bookmarks existentes. */
export default function CuadraturaRedirectPage() {
  redirect("/finanzas/flujo-caja");
}
