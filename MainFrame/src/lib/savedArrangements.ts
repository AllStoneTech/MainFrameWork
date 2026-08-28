// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Named saved arrangements for Matrix Studio's Canvas and Animator tabs
 * — explicit "save as" snapshots, independent of the undo history in
 * history.ts. Generic over the saved payload shape (a pixel buffer for
 * Canvas, a frame array for Animator) so both tabs share one component
 * (SavedArrangements.tsx) and one persisted-list shape.
 */

export interface SavedArrangement<T> {
  id: string;
  name: string;
  data: T;
  /** ISO timestamp, set at save time. */
  savedAt: string;
}

/** Appends a new named entry; does not mutate `list`. */
export function addArrangement<T>(list: SavedArrangement<T>[], name: string, data: T): SavedArrangement<T>[] {
  const entry: SavedArrangement<T> = {
    id: crypto.randomUUID(),
    name,
    data,
    savedAt: new Date().toISOString(),
  };
  return [...list, entry];
}

/** Removes the entry with `id`; a no-op (returns an equal list) if no entry matches. */
export function removeArrangement<T>(list: SavedArrangement<T>[], id: string): SavedArrangement<T>[] {
  return list.filter((entry) => entry.id !== id);
}
