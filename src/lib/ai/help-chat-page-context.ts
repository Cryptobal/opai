/** Contexto de página opcional desde el widget de Ayuda IA (cotización abierta, deal, etc.) */
export type HelpChatPageContext = {
  entityType: string;
  entityId: string;
  entityName: string;
  entityUrl?: string;
  /** Texto opcional desde el cliente (no garantizado en todas las rutas). */
  extra?: string;
};
