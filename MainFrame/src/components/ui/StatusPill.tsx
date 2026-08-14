import type { ReactElement } from "react";
type StatusVariant = "connected" | "disconnected" | "locked" | "warning";

interface StatusPillProps {
  label: string;
  variant: StatusVariant;
}

const DOT_CLASSES: Record<StatusVariant, string> = {
  connected: "bg-green-500",
  disconnected: "bg-gray-600",
  locked: "bg-primary",
  warning: "bg-yellow-500",
};

/**
 * Small dot-plus-label status indicator, generalized from the
 * "Device Connected" badge in the Sidebar footer.
 */
export function StatusPill({ label, variant }: StatusPillProps): ReactElement {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/5">
      <div className={`w-2 h-2 rounded-full ${DOT_CLASSES[variant]}`} />
      <span className="text-xs font-medium text-gray-400">{label}</span>
    </div>
  );
}
