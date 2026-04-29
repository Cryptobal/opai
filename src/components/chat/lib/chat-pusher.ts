import Pusher from "pusher-js";

let pusherInstance: Pusher | null = null;

export function getPusherClient(
  authEndpoint: string,
  authParams?: Record<string, string>
): Pusher | null {
  if (pusherInstance) return pusherInstance;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) {
    // Sin Pusher configurado (dev local) devolvemos null para que los
    // consumidores se salten la suscripción en silencio.
    return null;
  }

  pusherInstance = new Pusher(key, {
    cluster,
    authEndpoint,
    auth: { params: authParams || {} },
  });

  return pusherInstance;
}

export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
  }
}
