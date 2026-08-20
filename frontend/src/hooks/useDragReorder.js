import { useCallback, useRef, useState } from 'react';

// Phase 24: a small, dependency-free drag-to-reorder hook built on the
// Pointer Events API. The native HTML5 Drag and Drop API was deliberately
// NOT used -- it has no real touch support, which this feature explicitly
// needs (mobile wizard/gallery reordering). Pointer Events unify mouse and
// touch into one event stream, so this single implementation covers both
// without a dependency like react-beautiful-dnd/dnd-kit, which would be
// overkill for a bounded list of at most ~100 items.
//
// Reordering is nearest-neighbor: while dragging, the item whose bounding-
// rect center is closest to the pointer becomes the current drop target;
// releasing the pointer commits that order via `onReorder(newIds)`. Callers
// own what "commit" means -- a purely client-side array re-sort (the wizard,
// pre-upload) or a persisted API call (the post-upload gallery/library).
export default function useDragReorder({ ids, onReorder, disabled = false }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const nodesRef = useRef(new Map()); // id -> HTMLElement
  const orderRef = useRef(ids);
  orderRef.current = ids;

  const registerNode = useCallback((id, node) => {
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  }, []);

  const findNearestId = useCallback((clientX, clientY) => {
    let bestId = null;
    let bestDist = Infinity;
    nodesRef.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = (cx - clientX) ** 2 + (cy - clientY) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    });
    return bestId;
  }, []);

  const getHandleProps = useCallback(
    (id) => {
      if (disabled) return {};
      return {
        onPointerDown: (e) => {
          if (typeof e.button === 'number' && e.button !== 0) return; // left/primary only
          e.preventDefault();
          const draggingIdLocal = id;
          let overIdLocal = id;
          setDraggingId(draggingIdLocal);
          setOverId(overIdLocal);

          const onMove = (ev) => {
            ev.preventDefault();
            const nearest = findNearestId(ev.clientX, ev.clientY);
            if (nearest) {
              overIdLocal = nearest;
              setOverId(nearest);
            }
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            const order = orderRef.current;
            const from = order.indexOf(draggingIdLocal);
            const to = order.indexOf(overIdLocal);
            if (from !== -1 && to !== -1 && from !== to) {
              const next = [...order];
              next.splice(from, 1);
              next.splice(to, 0, draggingIdLocal);
              onReorder(next);
            }
            setDraggingId(null);
            setOverId(null);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
          window.addEventListener('pointercancel', onUp);
        },
        style: { touchAction: 'none', cursor: 'grab' },
      };
    },
    [disabled, findNearestId, onReorder]
  );

  return { registerNode, getHandleProps, draggingId, overId };
}
