import type { ReactElement } from "react";
import { useState } from "react";
import { Circle, Play, Trash2, Plus } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";

interface Macro {
  id: string;
  name: string;
  steps: number;
  boundKey: string;
}

const MOCK_MACROS: Macro[] = [
  { id: "m1", name: "Screenshot + Paste", steps: 3, boundKey: "Layer 2 / F13" },
  { id: "m2", name: "Git Commit Snippet", steps: 5, boundKey: "Layer 1 / M1" },
];

/**
 * Macro list stub. Recording/playback isn't wired to the raw-HID macro
 * protocol yet — this establishes the page layout and interaction shape.
 */
export default function MacrosTab(): ReactElement {
  const [macros, setMacros] = useState<Macro[]>(MOCK_MACROS);
  const [recording, setRecording] = useState(false);

  const removeMacro = (id: string): void => {
    setMacros((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Macros</h2>
        <button
          onClick={() => setRecording((r) => !r)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
            recording ? "bg-red-500 text-white" : "bg-primary text-black hover:bg-orange-600"
          }`}
        >
          <Circle size={14} fill="currentColor" />
          {recording ? "Recording..." : "Record Macro"}
        </button>
      </div>

      {macros.length === 0 ? (
        <EmptyState icon={Plus} message="No macros recorded yet" />
      ) : (
        <div className="space-y-2">
          {macros.map((macro) => (
            <div
              key={macro.id}
              className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5 hover:border-white/10 transition-colors group"
            >
              <div>
                <div className="text-sm font-medium text-white">{macro.name}</div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">
                  {macro.steps} steps &middot; bound to {macro.boundKey}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-white/5">
                  <Play size={16} />
                </button>
                <button
                  onClick={() => removeMacro(macro.id)}
                  className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white/5"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
