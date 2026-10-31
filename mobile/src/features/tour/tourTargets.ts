import { useCallback } from 'react';
import type { View } from 'react-native';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const targets = new Map<string, View>();

/** Attach to a control the tour should spotlight: `<View ref={useTourTarget('generate-cta')} collapsable={false}>`. */
export function useTourTarget(id: string) {
  return useCallback(
    (node: View | null) => {
      if (node) targets.set(id, node);
      else targets.delete(id);
    },
    [id]
  );
}

/** Window coordinates of a registered control, or null when it isn't mounted. */
export function measureTarget(id: string): Promise<Rect | null> {
  const node = targets.get(id);
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });
}

/** The bottom tab bar is drawn by the navigator, so a tab's rect is derived from the screen area above it: the bar
 * fills the space between the bottom of the screen container and the bottom of the window. */
export function tabRect(screen: Rect, windowHeight: number, windowWidth: number, index: number, count: number): Rect | null {
  const top = screen.y + screen.height;
  const height = windowHeight - top;
  if (height <= 0) return null;
  const width = windowWidth / count;
  return { x: width * index, y: top, width, height };
}
