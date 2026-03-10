"use client";

import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatSidePanelContext } from "./ChatFloatingProvider";

interface Props {
  contactId: string;
  portalEnabled: boolean;
}

export function StartChatButton({ contactId, portalEnabled }: Props) {
  const ctx = useChatSidePanelContext();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!portalEnabled || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}/chat`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        await ctx.refreshChannels?.();
        ctx.openPanel();
        ctx.selectChannel(json.data.channelId);
      } else {
        console.error("Failed to start chat:", json.error);
      }
    } catch (err) {
      console.error("Failed to start chat:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={!portalEnabled || loading}
      title={!portalEnabled ? "El contacto no tiene portal activo" : "Iniciar chat externo"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4 mr-1.5" />
      )}
      Chat
    </Button>
  );
}
