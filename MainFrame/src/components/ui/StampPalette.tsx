// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Symbol picker for Matrix Studio's stamp tool, shared by CanvasTab and
 * AnimatorTab. Reports the selected letter, digit, icon, or typed-text
 * bitmap back to the caller as a StampGlyph, which feeds stampPlace.ts's
 * useStampPlace hook for hover-preview + click-to-commit placement.
 * Shows real glyph/icon shapes via tiny PixelGrids rather than text
 * labels, so the palette itself doubles as a preview of the font.
 */
import { useState, type ReactElement } from "react";
import { Eraser } from "lucide-react";
import { PixelGrid } from "./PixelGrid";
import { FONT, GLYPH_HEIGHT, GLYPH_WIDTH, renderText } from "../../lib/bitmapFont";
import { ICON_HEIGHT, ICON_WIDTH, ICONS } from "../../lib/matrixIcons";
import type { StampGlyph } from "../../lib/stampPlace";

// Letters and digits only — punctuation is still reachable via the typed
// text field below, but isn't worth its own palette button.
const LETTERS_DIGITS = Object.keys(FONT).filter((char) => /^[A-Z0-9]$/.test(char));

interface StampPaletteProps {
  /** Panel width in columns, used to center a typed-text stamp the same way renderText centers stacked glyphs. */
  panelWidth: number;
  activeStamp: StampGlyph | null;
  onChangeStamp: (stamp: StampGlyph | null) => void;
  /** Called when the Clear icon is clicked — the palette doesn't know what "clear" means for the caller (whole canvas vs. just the active frame). */
  onClear: () => void;
  /** Tooltip for the Clear icon, e.g. "Clear canvas" or "Clear current frame". */
  clearLabel: string;
}

interface StampButtonProps {
  width: number;
  height: number;
  pixels: number[];
  label: string;
  selected: boolean;
  onClick: () => void;
}

/** Small button rendering a glyph/icon's real bitmap, highlighted when it's the active stamp. */
function StampButton({ width, height, pixels, label, selected, onClick }: StampButtonProps): ReactElement {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`p-1.5 rounded-lg border transition-colors ${
        selected ? "border-primary bg-primary/10" : "border-white/10 bg-black/20 hover:border-white/30"
      }`}
    >
      <PixelGrid width={width} height={height} pixels={pixels} cellSize={3} gap={1} interactive={false} />
    </button>
  );
}

/**
 * Palette for picking what the stamp tool places next: a letter/digit
 * from the shared 5x7 font, a small icon, or an arbitrary typed string
 * (composed via bitmapFont's renderText into one multi-character stamp).
 */
export function StampPalette({
  panelWidth,
  activeStamp,
  onChangeStamp,
  onClear,
  clearLabel,
}: StampPaletteProps): ReactElement {
  const [text, setText] = useState("");

  const useTypedText = (): void => {
    if (!text.trim()) return;
    const bitmap = renderText(text, panelWidth);
    onChangeStamp({ width: bitmap.width, height: bitmap.height, pixels: bitmap.pixels });
  };

  return (
    <div className="p-3 bg-black/20 border border-white/10 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Stamp Palette</span>
        <button
          type="button"
          onClick={onClear}
          title={clearLabel}
          className="p-1 rounded text-gray-400 hover:text-red-400"
        >
          <Eraser size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {LETTERS_DIGITS.map((char) => (
          <StampButton
            key={char}
            width={GLYPH_WIDTH}
            height={GLYPH_HEIGHT}
            pixels={FONT[char]}
            label={char}
            selected={activeStamp?.pixels === FONT[char]}
            onClick={() => onChangeStamp({ width: GLYPH_WIDTH, height: GLYPH_HEIGHT, pixels: FONT[char] })}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {ICONS.map((icon) => (
          <StampButton
            key={icon.id}
            width={ICON_WIDTH}
            height={ICON_HEIGHT}
            pixels={icon.pixels}
            label={icon.label}
            selected={activeStamp?.pixels === icon.pixels}
            onClick={() => onChangeStamp({ width: ICON_WIDTH, height: ICON_HEIGHT, pixels: icon.pixels })}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type text..."
          style={{ colorScheme: "dark" }}
          className="flex-1 min-w-0 px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200"
        />
        <button
          type="button"
          onClick={useTypedText}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-white text-black text-sm font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Use
        </button>
      </div>
    </div>
  );
}
