'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook para persistir estado en localStorage
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // Silent fail
    }
  };

  return [storedValue, setValue];
}

/**
 * Hook to track which entity IDs have unread notes for a given context type.
 * Fetches on mount and listens for 'opai-note-seen' events to refresh.
 */
export function useUnreadNoteIds(contextType: string): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    fetch(`/api/notes/unread-entity-ids?contextType=${contextType}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (mountedRef.current && data.success && Array.isArray(data.data)) {
          setIds(new Set(data.data));
        }
      })
      .catch(() => {});
  }, [contextType]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const onSeen = () => refresh();
    window.addEventListener("opai-note-seen", onSeen);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("opai-note-seen", onSeen);
    };
  }, [refresh]);

  return ids;
}
