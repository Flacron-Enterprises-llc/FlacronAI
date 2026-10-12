import { useEffect, useRef } from 'react';

/**
 * Phase 9 — the id a report hook currently serves. Async results are applied only while
 * `ref.current` still equals the id they were requested for, so a late response for a
 * previous report (route id changed by a deep link / notification tap) is dropped.
 * Declare it before the hook's load effect: effects run in order, so the ref is current
 * when the new load starts.
 */
export function useActiveId(id: string) {
  const ref = useRef(id);
  useEffect(() => {
    ref.current = id;
  }, [id]);
  return ref;
}
