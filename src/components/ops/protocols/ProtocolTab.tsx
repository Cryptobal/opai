"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtocolEditorClient } from "./ProtocolEditorClient";
import { ProtocolCreationWizard } from "./ProtocolCreationWizard";
import { Loader2 } from "lucide-react";

interface ProtocolTabProps {
  installationId: string;
  installationName: string;
}

/**
 * ProtocolTab — Wrapper that shows the creation wizard if no protocol exists,
 * or the editor if there are already sections.
 */
export function ProtocolTab({ installationId, installationName }: ProtocolTabProps) {
  const [hasProtocol, setHasProtocol] = useState<boolean | null>(null);
  const [key, setKey] = useState(0); // force re-mount

  const checkProtocol = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/protocols?installationId=${installationId}`);
      const json = await res.json();
      setHasProtocol(json.success && json.data.length > 0);
    } catch {
      setHasProtocol(false);
    }
  }, [installationId]);

  useEffect(() => {
    checkProtocol();
  }, [checkProtocol, key]);

  if (hasProtocol === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasProtocol) {
    return (
      <ProtocolCreationWizard
        installationId={installationId}
        onComplete={() => setKey((k) => k + 1)}
      />
    );
  }

  return (
    <ProtocolEditorClient
      key={key}
      installationId={installationId}
      installationName={installationName}
    />
  );
}
