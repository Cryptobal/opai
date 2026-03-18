function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
}

export async function subscribeToPush(params: {
  registration: ServiceWorkerRegistration;
  portalType: 'app' | 'cliente' | 'guardia' | 'rondas' | 'supervisor' | 'marcacion' | 'acceso';
  userType: 'admin' | 'contact' | 'guardia';
  userId: string;
  tenantId: string;
  /** For portal (guardia/contact): headers to prove session. Admin uses cookie. */
  sessionHeaders?: Record<string, string>;
}): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const subscription = await params.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (params.sessionHeaders) Object.assign(headers, params.sessionHeaders);

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        portalType: params.portalType,
        userType: params.userType,
        userId: params.userId,
        tenantId: params.tenantId,
      }),
    });

    // Store context in SW cache for pushsubscriptionchange re-subscribe
    if (res.ok && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'STORE_PUSH_CONTEXT',
        context: {
          portalType: params.portalType,
          userType: params.userType,
          userId: params.userId,
          tenantId: params.tenantId,
        },
      });
    }

    return res.ok;
  } catch (error) {
    console.error('[push] Subscription failed:', error);
    return false;
  }
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration,
  /** For portal: headers to prove session. Admin uses cookie. */
  sessionHeaders?: Record<string, string>
): Promise<boolean> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionHeaders) Object.assign(headers, sessionHeaders);

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    if (!res.ok) {
      console.warn('[push] Server unsubscribe failed:', res.status);
      // Still unsubscribe locally to maintain browser state consistency
    }

    await subscription.unsubscribe();
    return true;
  } catch (error) {
    console.error('[push] Unsubscribe failed:', error);
    return false;
  }
}
