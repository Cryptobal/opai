import { redirect } from 'next/navigation';

/**
 * La configuración de "Proveedor de IA por defecto" de plataforma se eliminó:
 * OPAI no provee IA a los tenants — cada tenant configura su propio proveedor
 * en Configuración › Proveedores de IA. Esta ruta se conserva solo para
 * redirigir enlaces antiguos al panel de consumo.
 */
export default function PlatformAiSettingsRedirect() {
  redirect('/platform/ai/usage');
}
