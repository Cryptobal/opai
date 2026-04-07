"use client";

/**
 * ChatPageContextProvider — contexto de página tipo "Notion AI".
 *
 * Permite que cualquier página (ficha de cliente, cotización, deal, instalación,
 * documento) registre cuál es la entidad que el usuario está viendo, para que
 * el asistente IA pueda responder preguntas contextuales ("resúmeme este
 * contrato", "qué documentos tiene este cliente", "cuándo vence esta cotización")
 * sin que el usuario tenga que repetir el nombre.
 *
 * Uso:
 *
 *   // En la ficha del cliente:
 *   useRegisterChatPageContext({
 *     entityType: "crm_account",
 *     entityId: account.id,
 *     entityName: account.name,
 *     entityUrl: `/crm/accounts/${account.id}`,
 *   });
 *
 * El widget de chat lee el contexto y lo envía al backend en cada mensaje.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ChatPageContextEntityType =
  | "crm_account"
  | "crm_deal"
  | "crm_installation"
  | "crm_contact"
  | "cpq_quote"
  | "doc_document"
  | "ops_guardia"
  | "other";

export type ChatPageContextValue = {
  entityType: ChatPageContextEntityType;
  entityId: string;
  entityName: string;
  entityUrl?: string;
  /** Texto opcional adicional que se inyecta al system prompt (ej: estado del deal). */
  extra?: string;
};

type ChatPageContextStore = {
  context: ChatPageContextValue | null;
  setContext: (value: ChatPageContextValue | null) => void;
};

const ChatPageContext = createContext<ChatPageContextStore | null>(null);

export function ChatPageContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ChatPageContextValue | null>(null);
  const value = useMemo<ChatPageContextStore>(
    () => ({ context, setContext }),
    [context],
  );
  return (
    <ChatPageContext.Provider value={value}>{children}</ChatPageContext.Provider>
  );
}

/** Lee el contexto actual (puede ser null). No-op si no hay provider montado. */
export function useChatPageContext(): ChatPageContextValue | null {
  const store = useContext(ChatPageContext);
  return store?.context ?? null;
}

/** Limpia el contexto manualmente (botón "X" en el pill del chat). */
export function useClearChatPageContext(): () => void {
  const store = useContext(ChatPageContext);
  return useCallback(() => {
    store?.setContext(null);
  }, [store]);
}

/**
 * Registra contexto al montar y lo limpia al desmontar.
 * Reactivo a cambios en los campos: si el usuario navega a otra ficha sin
 * desmontar el componente, actualiza correctamente.
 */
export function useRegisterChatPageContext(value: ChatPageContextValue | null) {
  const store = useContext(ChatPageContext);
  // Estabilizamos por valores serializables; basta con depender de los strings.
  const entityType = value?.entityType;
  const entityId = value?.entityId;
  const entityName = value?.entityName;
  const entityUrl = value?.entityUrl;
  const extra = value?.extra;

  useEffect(() => {
    if (!store) return;
    if (!entityType || !entityId || !entityName) {
      store.setContext(null);
      return;
    }
    store.setContext({ entityType, entityId, entityName, entityUrl, extra });
    return () => {
      store.setContext(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, entityType, entityId, entityName, entityUrl, extra]);
}
