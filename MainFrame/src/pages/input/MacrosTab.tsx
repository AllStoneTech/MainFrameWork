// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Macro editor tab (Input Studio). See the exported component's doc
 * comment below for how this talks to the real macro buffer.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, Plus, ArrowLeft } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { BASIC_KEYCODES, describeKeycode } from "../../lib/qmkKeycodes";
import {
  decodeMacroBytes,
  encodeMacroSteps,
  splitMacroBuffer,
  joinMacroBuffer,
  ensureSlotCount,
  type MacroStep,
} from "../../lib/macroEncoding";

type DraftType = MacroStep["type"];
const DRAFT_TYPES: { id: DraftType; label: string }[] = [
  { id: "text", label: "Type text" },
  { id: "tap", label: "Tap key" },
  { id: "down", label: "Hold key down" },
  { id: "up", label: "Release key" },
  { id: "delay", label: "Wait" },
];

function summarizeStep(step: MacroStep): string {
  switch (step.type) {
    case "text":
      return `Type "${step.text}"`;
    case "tap":
      return `Tap ${describeKeycode(step.keycode)}`;
    case "down":
      return `Hold ${describeKeycode(step.keycode)} down`;
    case "up":
      return `Release ${describeKeycode(step.keycode)}`;
    case "delay":
      return `Wait ${step.ms}ms`;
  }
}

/**
 * Macro editor: a list of the keyboard's real macro slots (from
 * `get_macro_count`), each editable as a step sequence (type text /
 * tap / hold / release / delay) that gets encoded into QMK's Send
 * String byte format and written to the real macro buffer
 * (`get_macro_buffer`/`set_macro_buffer` in keyboard_mapper.rs, encoding
 * in `macroEncoding.ts`).
 *
 * This is a step *editor*, not an OS-level keystroke *recorder* — VIA
 * itself works the same way (there's no "record my keypresses" in real
 * VIA either; you build a step sequence by hand). That also sidesteps
 * needing a global keyboard hook from a desktop app, which would be a
 * much bigger ask (and a keylogger-shaped one) than this feature needs.
 *
 * A macro plays back only when its assigned key is actually pressed —
 * there's no VIA command to trigger one from the host, so there's no
 * "Play" button here; assign a macro to a key in the Keymap tab's
 * "Macro" category (`Play Macro N`) to actually use it.
 */
export default function MacrosTab(): ReactElement {
  const [macroCount, setMacroCount] = useState<number | null>(null);
  const [bufferSize, setBufferSize] = useState(0);
  const [slots, setSlots] = useState<number[][]>([]);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [editSteps, setEditSteps] = useState<MacroStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftType, setDraftType] = useState<DraftType>("text");
  const [draftText, setDraftText] = useState("");
  const [draftKeycode, setDraftKeycode] = useState(BASIC_KEYCODES[0].code);
  const [draftMs, setDraftMs] = useState(100);

  const loadAll = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const count = await invoke<number>("get_macro_count");
      const size = await invoke<number>("get_macro_buffer_size");
      const raw = await invoke<number[]>("get_macro_buffer");
      setMacroCount(count);
      setBufferSize(size);
      setSlots(ensureSlotCount(splitMacroBuffer(raw), count));
    } catch (err) {
      console.error("Failed to load macros:", err);
      setUnsupported(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll().catch((err: unknown) => console.error("Unhandled macro load error:", err));
  }, []);

  const openSlot = (index: number): void => {
    setActiveSlot(index);
    setEditSteps(decodeMacroBytes(slots[index] ?? []));
    setError(null);
  };

  const addStep = (): void => {
    if (draftType === "text") {
      if (!draftText.trim()) return;
      setEditSteps((prev) => [...prev, { type: "text", text: draftText }]);
      setDraftText("");
    } else if (draftType === "delay") {
      setEditSteps((prev) => [...prev, { type: "delay", ms: draftMs }]);
    } else {
      setEditSteps((prev) => [...prev, { type: draftType, keycode: draftKeycode }]);
    }
  };

  const removeStep = (index: number): void => {
    setEditSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const saveActiveSlot = async (): Promise<void> => {
    if (activeSlot === null) return;
    setSaving(true);
    setError(null);
    const newSlots = slots.map((slot, i) => (i === activeSlot ? encodeMacroSteps(editSteps) : slot));
    const buffer = joinMacroBuffer(newSlots);
    if (buffer.length > bufferSize) {
      setError(
        `This would need ${buffer.length} bytes of macro storage, but the keyboard only has ${bufferSize} total. Shorten this macro (or another one) and try again.`
      );
      setSaving(false);
      return;
    }
    try {
      await invoke("set_macro_buffer", { data: buffer });
      setSlots(newSlots);
      setActiveSlot(null);
    } catch (err) {
      console.error("Failed to save macro buffer:", err);
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async (): Promise<void> => {
    if (!window.confirm("Clear every macro slot on the keyboard? This can't be undone from here.")) return;
    setResetting(true);
    setError(null);
    try {
      await invoke("reset_macros");
      await loadAll();
      setActiveSlot(null);
    } catch (err) {
      console.error("Failed to reset macros:", err);
      setError(String(err));
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-gray-400">Loading macros from the keyboard...</p>
      </Card>
    );
  }

  if (unsupported) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-bold text-white mb-2">Macro editing unavailable</h2>
        <p className="text-sm text-gray-400 max-w-xl">
          The keyboard didn&apos;t respond to a macro-buffer query (
          <code className="text-xs bg-black/30 px-1 py-0.5 rounded">get_macro_count</code>). This usually means the
          currently-flashed firmware doesn&apos;t have dynamic-keymap support built in yet — see the Keymap tab for
          the same caveat in more detail.
        </p>
        <p className="text-xs text-gray-500 mt-3 font-mono break-all">{unsupported}</p>
      </Card>
    );
  }

  if (activeSlot !== null) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setActiveSlot(null)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
          >
            <ArrowLeft size={16} /> Back to macros
          </button>
          <h2 className="text-lg font-bold text-white">Macro {activeSlot}</h2>
          <button
            onClick={() => {
              saveActiveSlot().catch((err: unknown) => console.error("Unhandled save error:", err));
            }}
            disabled={saving}
            className="px-4 py-2 bg-primary text-black font-bold rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {error && <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">{error}</div>}

        <p className="text-xs text-gray-400 mb-3">
          Assign this in the Keymap tab&apos;s Macro category as &quot;Play Macro {activeSlot}&quot; to actually use
          it — macros only run when their assigned key is pressed.
        </p>

        {editSteps.length === 0 ? (
          <p className="text-xs text-gray-500 mb-4">No steps yet — add one below.</p>
        ) : (
          <div className="space-y-1.5 mb-4">
            {editSteps.map((step, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2.5 bg-black/20 rounded-lg border border-white/5 text-sm text-gray-200"
              >
                <span>
                  {i + 1}. {summarizeStep(step)}
                </span>
                <button onClick={() => removeStep(i)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="p-3 bg-black/20 rounded-lg border border-white/10 flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Step type</label>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as DraftType)}
              style={{ colorScheme: "dark" }}
              className="px-2 py-1.5 bg-black/40 border border-white/10 rounded text-sm text-gray-200"
            >
              {DRAFT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {draftType === "text" && (
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-gray-400 mb-1">Text</label>
              <input
                type="text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="w-full px-2 py-1.5 bg-black/40 border border-white/10 rounded text-sm text-gray-200"
              />
            </div>
          )}

          {(draftType === "tap" || draftType === "down" || draftType === "up") && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Key</label>
              <select
                value={draftKeycode}
                onChange={(e) => setDraftKeycode(Number(e.target.value))}
                style={{ colorScheme: "dark" }}
                className="px-2 py-1.5 bg-black/40 border border-white/10 rounded text-sm text-gray-200"
              >
                {BASIC_KEYCODES.map((k) => (
                  <option key={k.name} value={k.code}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {draftType === "delay" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Milliseconds</label>
              <input
                type="number"
                min={1}
                value={draftMs}
                onChange={(e) => setDraftMs(Number(e.target.value))}
                style={{ colorScheme: "dark" }}
                className="w-24 px-2 py-1.5 bg-black/40 border border-white/10 rounded text-sm text-gray-200"
              />
            </div>
          )}

          <button
            onClick={addStep}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-lg text-sm font-medium hover:bg-primary/20"
          >
            <Plus size={14} /> Add Step
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Macros</h2>
        <button
          onClick={() => {
            handleResetAll().catch((err: unknown) => console.error("Unhandled reset error:", err));
          }}
          disabled={resetting}
          className="px-3 py-2 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
        >
          {resetting ? "Resetting..." : "Reset All Macros"}
        </button>
      </div>

      {error && <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">{error}</div>}

      {macroCount === 0 ? (
        <EmptyState icon={Plus} message="Keyboard reports no macro slots" />
      ) : (
        <div className="space-y-2">
          {slots.map((slot, i) => {
            const steps = decodeMacroBytes(slot);
            return (
              <button
                key={i}
                onClick={() => openSlot(i)}
                className="w-full flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5 hover:border-white/10 transition-colors text-left"
              >
                <div>
                  <div className="text-sm font-medium text-white">Macro {i}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">
                    {steps.length === 0 ? "Empty" : `${steps.length} step${steps.length === 1 ? "" : "s"}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
