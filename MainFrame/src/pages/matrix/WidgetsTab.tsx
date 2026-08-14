import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { Clock, BatteryMedium, Cpu, AudioLines, GripVertical, X } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PixelGrid } from "../../components/ui/PixelGrid";
import { EmptyState } from "../../components/ui/EmptyState";
import { loadSettings, patchSettings } from "../../lib/settings";

const WIDTH = 9;
const HEIGHT = 34;
const SETTINGS_KEY = "matrix_widgets";

interface WidgetDef {
  type: string;
  label: string;
  icon: typeof Clock;
}

// Persisted layout only stores {type, id} — icon/label are re-derived from
// PALETTE on load, since component references aren't JSON-serializable.
interface PlacedWidget extends WidgetDef {
  id: string;
}
interface SavedWidget {
  type: string;
  id: string;
}

const PALETTE: WidgetDef[] = [
  { type: "clock", label: "Clock", icon: Clock },
  { type: "battery", label: "Battery", icon: BatteryMedium },
  { type: "cpu", label: "CPU Load", icon: Cpu },
  { type: "eq", label: "Audio EQ", icon: AudioLines },
];

/**
 * Widget composer for the Matrix Studio "Widgets" tab, modeled on FWMM's
 * three-pane pattern: a preview on the left, the active layout (ordered
 * widget stack) in the middle, and a widget palette on the right. Widgets
 * don't render to the actual matrix buffer yet — this establishes the
 * composition UI ahead of a real rendering engine. Layout persists to the
 * same encrypted settings blob LightingTab uses.
 */
export default function WidgetsTab(): ReactElement {
  const [layout, setLayout] = useState<PlacedWidget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = (settings[SETTINGS_KEY] as SavedWidget[] | undefined) ?? [];
      const restored = saved
        .map((w) => {
          const def = PALETTE.find((p) => p.type === w.type);
          return def ? { ...def, id: w.id } : null;
        })
        .filter((w): w is PlacedWidget => w !== null);
      setLayout(restored);
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const toSave: SavedWidget[] = layout.map((w) => ({ type: w.type, id: w.id }));
    patchSettings({ [SETTINGS_KEY]: toSave }).catch((err) => console.error("Failed to save widget layout:", err));
  }, [layout]);

  const addWidget = (def: WidgetDef): void => {
    setLayout((prev) => [...prev, { ...def, id: `${def.type}-${Date.now()}` }]);
  };

  const removeWidget = (id: string): void => {
    setLayout((prev) => prev.filter((w) => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="grid grid-cols-[1fr_320px_260px] gap-6 h-full">
      <Card className="p-6 flex flex-col items-center justify-center">
        <div className="bg-black/80 rounded-xl border border-gray-800 p-6">
          <PixelGrid width={WIDTH} height={HEIGHT} pixels={new Array(WIDTH * HEIGHT).fill(0)} interactive={false} cellSize={14} gap={3} />
        </div>
        <p className="text-xs text-gray-400 mt-4">Live widget preview coming soon</p>
      </Card>

      <Card className="p-4 flex flex-col">
        <h3 className="text-sm font-bold text-white mb-3 px-2">Active Layout</h3>
        {layout.length === 0 ? (
          <EmptyState icon={GripVertical} message="Add widgets from the palette" className="flex-1" />
        ) : (
          <div className="space-y-2 flex-1 overflow-auto">
            {layout.map((widget) => (
              <button
                key={widget.id}
                onClick={() => setSelectedId(widget.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  selectedId === widget.id
                    ? "bg-primary/10 border-primary/40"
                    : "bg-black/20 border-white/5 hover:border-white/20"
                }`}
              >
                <GripVertical size={14} className="text-gray-600" />
                <widget.icon size={16} className="text-primary" />
                <span className="text-sm text-white flex-1">{widget.label}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWidget(widget.id);
                  }}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-white mb-3 px-2">Widget Palette</h3>
        <div className="space-y-2">
          {PALETTE.map((def) => (
            <button
              key={def.type}
              onClick={() => addWidget(def)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-black/20 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
            >
              <def.icon size={16} className="text-gray-400" />
              <span className="text-sm text-gray-300">{def.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
