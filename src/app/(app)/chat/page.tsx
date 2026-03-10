"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useChatSidePanelContext } from "@/components/chat/ChatFloatingProvider";

/**
 * /chat route — redirects to /hub and opens the chat side panel.
 * Supports ?channel=<id> query param to auto-select a channel.
 */
export default function ChatPageRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatCtx = useChatSidePanelContext();

  useEffect(() => {
    chatCtx.openPanel();
    const channelId = searchParams.get("channel");
    if (channelId) chatCtx.selectChannel(channelId);
    router.replace("/hub");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
