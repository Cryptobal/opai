/**
 * iOS PWA detection utilities for Web Push support.
 *
 * iOS 16.4+ supports Web Push, but ONLY when the PWA is installed
 * to the homescreen (standalone mode). Safari browser tabs do NOT
 * support PushManager.
 */

/** True when running on any iOS device (iPhone/iPad/iPod). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** True when the PWA is running in standalone mode (added to homescreen). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

/** True when push notifications are supported in the current context. */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  // On iOS, push only works in standalone mode
  if (isIOS() && !isStandalone()) return false;
  return true;
}
