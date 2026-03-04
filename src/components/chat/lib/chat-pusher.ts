import Pusher from "pusher-js";

let pusherInstance: Pusher | null = null;

export function getPusherClient(
  authEndpoint: string,
  authParams?: Record<string, string>
): Pusher {
  if (pusherInstance) return pusherInstance;

  pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
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
