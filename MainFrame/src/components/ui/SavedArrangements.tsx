// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Named "save as" snapshots for Matrix Studio's Canvas and Animator tabs
 * — independent of the undo history in history.ts. A toolbar button that
 * opens a small popover (save-as-name + a list of saved entries with
 * Load/Delete), rather than a permanent panel, so it doesn't add to the
 * always-visible clutter both tabs are trying to reduce. Generic over
 * the saved payload (a pixel buffer for Canvas, a frame array for
 * Animator); persists its own list via the shared encrypted settings
 * blob (settings.ts), the same merge-only pattern AnimatorTab's frame
 * persistence already uses.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { FolderOpen, Save, Trash2, X } from "lucide-react";
import { PixelGrid } from "./PixelGrid";
import { addArrangement, removeArrangement, type SavedArrangement } from "../../lib/savedArrangements";
import { loadSettings, patchSettings } from "../../lib/settings";

interface SavedArrangementsProps<T> {
  /** Top-level key in the shared settings blob this list persists under. */
  settingsKey: string;
  currentData: T;
  /** Called with a saved entry's data when Load is clicked — pass e.g. `history.commit(() => data)` so loading stays undoable. */
  onLoad: (data: T) => void;
  /** Extracts a flat WIDTH*HEIGHT buffer from `data` for the tiny preview grid (Canvas: identity; Animator: frames[0]). */
  previewPixels: (data: T) => number[];
  previewWidth: number;
  previewHeight: number;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function SavedArrangements<T>({
  settingsKey,
  currentData,
  onLoad,
  previewPixels,
  previewWidth,
  previewHeight,
}: SavedArrangementsProps<T>): ReactElement {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<SavedArrangement<T>[]>([]);
  const [name, setName] = useState("");
  const loaded = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = settings[settingsKey] as SavedArrangement<T>[] | undefined;
      if (saved) setList(saved);
      loaded.current = true;
    });
  }, [settingsKey]);

  useEffect(() => {
    if (!loaded.current) return;
    patchSettings({ [settingsKey]: list }).catch((err) => console.error(`Failed to save ${settingsKey}:`, err));
  }, [list, settingsKey]);

  // Click-outside-to-close, so the popover behaves like a normal dropdown.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSave = (): void => {
    if (!name.trim()) return;
    setList((prev) => addArrangement(prev, name.trim(), currentData));
    setName("");
  };

  const handleLoad = (entry: SavedArrangement<T>): void => {
    onLoad(entry.data);
    setOpen(false);
  };

  const handleDelete = (id: string): void => {
    setList((prev) => removeArrangement(prev, id));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Saved arrangements"
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white text-sm font-medium"
      >
        <FolderOpen size={16} /> Saved
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 z-20 p-3 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Saved Arrangements</span>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Save current as..."
              style={{ colorScheme: "dark" }}
              className="flex-1 min-w-0 px-2 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              title="Save current as a new named arrangement"
              className="p-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={16} />
            </button>
          </div>

          {list.length === 0 ? (
            <p className="text-xs text-gray-500 py-2 text-center">Nothing saved yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {list.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 p-1.5 rounded-lg border border-white/5 bg-black/20 hover:border-white/20"
                >
                  <div className="shrink-0 bg-black/60 rounded p-1">
                    <PixelGrid
                      width={previewWidth}
                      height={previewHeight}
                      pixels={previewPixels(entry.data)}
                      cellSize={1.5}
                      gap={0.5}
                      interactive={false}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{entry.name}</div>
                    <div className="text-xs text-gray-500">{formatSavedAt(entry.savedAt)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLoad(entry)}
                    className="px-2 py-1 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    title="Delete"
                    className="p-1 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
