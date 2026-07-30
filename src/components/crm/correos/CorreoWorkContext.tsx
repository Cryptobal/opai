"use client";

/**
 * Fuente de verdad compartida del Panel de trabajo: links, tasks,
 * contact-context y deals de la cuenta. Una sola carga por recurso;
 * las mutaciones llaman reload(scope) para refrescar a todas las pestañas.
 *
 * Copiloto v4: `reload` devuelve Promise; `applyAccountOptimistic` evita la
 * race al asociar cuenta A→B (loadDeals usa el id nuevo de inmediato).
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
  priority?: string | null;
  assignedTo?: { id: string; name: string | null } | null;
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
  reload: (scope?: CorreoWorkReloadScope) => Promise<void>;
  /** Actualiza el accountId efectivo para loadDeals sin esperar re-fetch. */
  applyAccountOptimistic: (accountId: string | null) => void;
};

const CorreoWorkCtx = createContext<CorreoWorkValue | null>(null);

export function useCorreoWork(): CorreoWorkValue {
  const ctx = useContext(CorreoWorkCtx);
  if (!ctx) {
    throw new Error("useCorreoWork debe usarse dentro de CorreoWorkProvider");
  }
  return ctx;
}

export function useCorreoWorkOptional(): CorreoWorkValue | null {
  return useContext(CorreoWorkCtx);
}

export function CorreoWorkProvider({
  threadId,
  accountId,
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
  const [optimisticAccountId, setOptimisticAccountId] = useState<string | null | undefined>(
    undefined,
  );

  const cancelledRef = useRef(false);
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  // Prop gana sobre optimistic cuando el detalle refresca.
  const effectiveAccountId =
    optimisticAccountId !== undefined ? optimisticAccountId : accountId;

  useEffect(() => {
    setOptimisticAccountId(undefined);
  }, [accountId, revision, threadId]);

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

  const loadDeals = useCallback(async (accountOverride?: string | null) => {
    const acc = accountOverride !== undefined ? accountOverride : effectiveAccountId;
    if (!acc) {
      setDeals({ data: [], loading: false });
      return;
    }
    const tid = threadId;
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
  }, [threadId, effectiveAccountId]);

  const applyAccountOptimistic = useCallback(
    (next: string | null) => {
      setOptimisticAccountId(next);
      void loadDeals(next);
    },
    [loadDeals],
  );

  const reload = useCallback(
    async (scope: CorreoWorkReloadScope = "all") => {
      const jobs: Promise<void>[] = [];
      if (scope === "all" || scope === "links") jobs.push(loadLinks());
      if (scope === "all" || scope === "tasks") jobs.push(loadTasks());
      if (scope === "all" || scope === "contact") jobs.push(loadContact());
      if (scope === "all" || scope === "deals") jobs.push(loadDeals());
      await Promise.all(jobs);
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
  }, [threadId, revision, loadLinks, loadTasks, loadContact]);

  useEffect(() => {
    cancelledRef.current = false;
    void loadDeals();
  }, [effectiveAccountId, revision, loadDeals]);

  const value = useMemo<CorreoWorkValue>(
    () => ({
      threadId,
      accountId: effectiveAccountId,
      links,
      tasks,
      contactContext,
      deals,
      reload,
      applyAccountOptimistic,
    }),
    [
      threadId,
      effectiveAccountId,
      links,
      tasks,
      contactContext,
      deals,
      reload,
      applyAccountOptimistic,
    ],
  );

  return <CorreoWorkCtx.Provider value={value}>{children}</CorreoWorkCtx.Provider>;
}
