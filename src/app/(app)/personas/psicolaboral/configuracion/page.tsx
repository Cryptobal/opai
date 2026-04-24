import { redirect } from "next/navigation";

/**
 * Redirect legacy → config module.
 * La configuración del módulo ahora vive en /opai/configuracion/psicolaboral.
 */
export default function Legacy() {
  redirect("/opai/configuracion/psicolaboral");
}
