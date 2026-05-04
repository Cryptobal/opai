/**
 * Canales de notificación visibles al usuario en la UI de preferencias.
 *
 * - bell:        in-app (campana del topbar)
 * - email:       email transaccional vía Resend
 * - pushDesktop: Web Push API en navegador desktop
 * - pushMobile:  Web Push en navegador mobile + apps Capacitor (Android/iOS)
 *
 * El catálogo (`catalog.ts`) sigue exponiendo `defaults.push` como un único
 * boolean: cuando se lee, se replica como pushDesktop=push y pushMobile=push.
 * Esto mantiene la compatibilidad con el catálogo existente sin tocarlo.
 */
export type UserChannel = 'bell' | 'email' | 'pushDesktop' | 'pushMobile';

export const USER_CHANNELS: UserChannel[] = ['bell', 'email', 'pushDesktop', 'pushMobile'];

export interface ChannelPrefsLegacy {
  bell?: boolean;
  email?: boolean;
  /** Shape antiguo. Si existe, se interpreta como pushDesktop=push y pushMobile=push. */
  push?: boolean;
  pushDesktop?: boolean;
  pushMobile?: boolean;
}

export interface ChannelPrefs {
  bell?: boolean;
  email?: boolean;
  pushDesktop?: boolean;
  pushMobile?: boolean;
}

/**
 * Lee un valor del shape legacy y devuelve el shape nuevo.
 * Aplica la regla: si solo está `push`, replicarlo a desktop+mobile.
 */
export function normalizePrefs(input: ChannelPrefsLegacy | undefined): ChannelPrefs {
  const out: ChannelPrefs = {};
  if (!input) return out;
  if (typeof input.bell === 'boolean') out.bell = input.bell;
  if (typeof input.email === 'boolean') out.email = input.email;

  const hasNew = typeof input.pushDesktop === 'boolean' || typeof input.pushMobile === 'boolean';
  if (hasNew) {
    if (typeof input.pushDesktop === 'boolean') out.pushDesktop = input.pushDesktop;
    if (typeof input.pushMobile === 'boolean') out.pushMobile = input.pushMobile;
  } else if (typeof input.push === 'boolean') {
    out.pushDesktop = input.push;
    out.pushMobile = input.push;
  }
  return out;
}

/**
 * Toma defaults del catálogo (que solo expone `push: boolean`) y los expande
 * al shape de 4 canales para que la UI pueda mostrar los toggles correctos.
 */
export function expandCatalogDefaults(d: { bell?: boolean; email?: boolean; push?: boolean }): ChannelPrefs {
  return {
    bell: d.bell,
    email: d.email,
    pushDesktop: d.push,
    pushMobile: d.push,
  };
}
