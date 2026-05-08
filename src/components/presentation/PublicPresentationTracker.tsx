"use client";

import { useEffect } from "react";

/**
 * Punto de extensión para analytics de vistas públicas.
 * POST público opcional cuando exista endpoint dedicado.
 */
export function PublicPresentationTracker(props: {
  presentationId: string;
  ipAddress: string;
  userAgent: string;
}) {
  useEffect(() => {
    void props.presentationId;
    void props.ipAddress;
    void props.userAgent;
  }, [props.presentationId, props.ipAddress, props.userAgent]);

  return null;
}
