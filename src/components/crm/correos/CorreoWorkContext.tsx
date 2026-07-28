"use client";

/**
 * Fuente de verdad compartida del Panel de trabajo: links, tasks,
 * contact-context y deals de la cuenta. Una sola carga por recurso;
 * las mutaciones llaman reload(scope) para refrescar a todas las pestañas.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ResolvedThreadLink } from "@/modules/crm/email/email-thread-links";

export type CorreoWorkTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  allDay: boolean;
};

export type CorreoWorkContactContext = {
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    roleTitle: string | null;
    accountId: string | null;
    accountName: string | null;
  } | null;
  openDeals?: Array<{ id: string; title: string }>;
  recentThreads?: Array<{ id: string; subject: string; lastMessageAt: string | null }>;
};

export type CorreoWorkDeal = { id: string; title: string; status: string };

export type CorreoWorkReloadScope = "links" | "tasks" | "contact" | "deals" | "all";

type ResourceState<T> = { data: T | null; loading: boolean };

type CorreoWorkValue = {
  threadId: string;
  accountId: string | null;
  links: ResourceState<ResolvedThreadLink[]>;
  tasks: ResourceState<CorreoWorkTask[]>;
  contactContext: ResourceState<CorreoWorkContactContext>;
  deals: ResourceState<CorreoWorkDeal[]>;
  reload: (scope?: CorreoWorkReloadScope) => void;
};

const CorreoWorkCtx = createContext<CorreoWorkValue | null>(null);

export function useCorreoWork(): CorreoWorkValue {
  const ctx = useContext(CorreoWorkCtx);
  if (!ctx) {
    throw new Error("useCorreoWork debe usarse dentro de CorreoWorkProvider");
  }
  return ctx;
}

/** Hook opcional: null fuera del provider (p. ej. Summary embebido en cascada). */
export function useCorreoWorkOptional(): CorreoWorkValue | null {
  return useContext(CorreoWorkCtx);
}

export function CorreoWorkProvider({
  threadId,
  accountId,
  /** Incrementa al refrescar el detalle (p. ej. tras crear estructura). */
  revision = 0,
  children,
}: {
  threadId: string;
  accountId: string | null;
  revision?: number;
  children: ReactNode;
}) {
  const [links, setLinks] = useState<ResourceState<ResolvedThreadLink[]>>({
    data: null,
    loading: true,
  });
  const [tasks, setTasks] = useState<ResourceState<CorreoWorkTask[]>>({
    data: null,
    loading: true,
  });
  const [contactContext, setContactContext] = useState<ResourceState<CorreoWorkContactContext>>({
    data: null,
    loading: true,
  });
  const [deals, setDeals] = useState<ResourceState<CorreoWorkDeal[]>>({
    data: null,
    loading: false,
  });

  const cancelledRef = useRef(false);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const loadLinks = useCallback(async () => {
    const tid = threadId;
    setLinks((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(`/api/crm/correos/${tid}/links`);
      const d = await res.json().catch(() => ({}));
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      setLinks({
        data: Array.isArray(d.links) ? d.links : [],
        loading: false,
      });
    } catch {
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      setLinks({ data: [], loading: false });
    }
  }, [threadId]);

  const loadTasks = useCallback(async () => {
    const tid = threadId;
    setTasks((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(`/api/crm/correos/${tid}/tasks`);
      const d = await res.json().catch(() => ({}));
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      setTasks({
        data: Array.isArray(d.tasks) ? d.tasks : [],
        loading: false,
      });
    } catch {
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      setTasks({ data: [], loading: false });
    }
  }, [threadId]);

  const loadContact = useCallback(async () => {
    const tid = threadId;
    setContactContext((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(`/api/crm/correos/${tid}/contact-context`);
      const d = await res.json().catch(() => null);
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      setContactContext({
        data: d && typeof d === "object" ? (d as CorreoWorkContactContext) : { contact: null },
        loading: false,
      });
    } catch {
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      setContactContext({ data: { contact: null }, loading: false });
    }
  }, [threadId]);

  const loadDeals = useCallback(async () => {
    if (!accountId) {
      setDeals({ data: [], loading: false });
      return;
    }
    const tid = threadId;
    const acc = accountId;
    setDeals((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(
        `/api/crm/correos/deals-for-account?accountId=${encodeURIComponent(acc)}`,
      );
      const j = await res.json().catch(() => ({}));
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      const items = Array.isArray(j.items) ? j.items : [];
      setDeals({
        data: items.map((d: { id: string; title: string; status?: string }) => ({
          id: d.id,
          title: d.title,
          status: d.status ?? "open",
        })),
        loading: false,
      });
    } catch {
      if (cancelledRef.current || threadIdRef.current !== tid) return;
      setDeals({ data: [], loading: false });
    }
  }, [threadId, accountId]);

  const reload = useCallback(
    (scope: CorreoWorkReloadScope = "all") => {
      if (scope === "all" || scope === "links") void loadLinks();
      if (scope === "all" || scope === "tasks") void loadTasks();
      if (scope === "all" || scope === "contact") void loadContact();
      if (scope === "all" || scope === "deals") void loadDeals();
    },
    [loadLinks, loadTasks, loadContact, loadDeals],
  );

  useEffect(() => {
    cancelledRef.current = false;
    setLinks({ data: null, loading: true });
    setTasks({ data: null, loading: true });
    setContactContext({ data: null, loading: true });
    void Promise.all([loadLinks(), loadTasks(), loadContact()]);
    return () => {
      cancelledRef.current = true;
    };
    // revision: refresco del detalle (estructura creada, associate, etc.)
  }, [threadId, revision, loadLinks, loadTasks, loadContact]);

  useEffect(() => {
    cancelledRef.current = false;
    void loadDeals();
  }, [accountId, revision, loadDeals]);

  const value = useMemo<CorreoWorkValue>(
    () => ({
      threadId,
      accountId,
      links,
      tasks,
      contactContext,
      deals,
      reload,
    }),
    [threadId, accountId, links, tasks, contactContext, deals, reload],
  );

  return <CorreoWorkCtx.Provider value={value}>{children}</CorreoWorkCtx.Provider>;
}
