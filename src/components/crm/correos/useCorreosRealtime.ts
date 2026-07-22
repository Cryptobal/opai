"use client";

import { useEffect, useRef, useState } from "react";
import type Pusher from "pusher-js";
import type { Channel } from "pusher-js";

export type CorreosRealtimeStatus = "connecting" | "live" | "fallback";
const GMAIL_MAILBOX_EVENT = "mailbox-changed";

export function useCorreosRealtime(
  channelName: string | null,
  onMailboxChanged: () => void,
): CorreosRealtimeStatus {
  const [status, setStatus] = useState<CorreosRealtimeStatus>("connecting");
  const changeRef = useRef(onMailboxChanged);
  changeRef.current = onMailboxChanged;

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!channelName || !key || !cluster) {
      setStatus("fallback");
      return;
    }

    let disposed = false;
    let pusher: Pusher | null = null;
    let channel: Channel | null = null;
    const handleChange = () => changeRef.current();
    void import("pusher-js")
      .then(({ default: PusherClient }) => {
        if (disposed) return;
        pusher = new PusherClient(key, {
          cluster,
          authEndpoint: "/api/crm/correos/realtime/auth",
        });
        pusher.connection.bind("connected", () => setStatus("live"));
        pusher.connection.bind("unavailable", () => setStatus("fallback"));
        pusher.connection.bind("failed", () => setStatus("fallback"));
        pusher.connection.bind("disconnected", () => setStatus("fallback"));
        pusher.connection.bind("error", () => setStatus("fallback"));
        channel = pusher.subscribe(channelName);
        channel.bind("pusher:subscription_error", () => setStatus("fallback"));
        channel.bind(GMAIL_MAILBOX_EVENT, handleChange);
      })
      .catch(() => {
        if (!disposed) setStatus("fallback");
      });

    return () => {
      disposed = true;
      channel?.unbind(GMAIL_MAILBOX_EVENT, handleChange);
      if (channel) pusher?.unsubscribe(channelName);
      pusher?.disconnect();
    };
  }, [channelName]);

  return status;
}
