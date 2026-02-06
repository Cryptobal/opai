import { redirect } from 'next/navigation';

/**
 * Ruta /opai - Redirige al dashboard principal
 */
export default function OpaiPage() {
  redirect('/opai/inicio');
}
