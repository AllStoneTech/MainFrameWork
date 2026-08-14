import type { ReactElement } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  className?: string;
}

/**
 * Dashed-border placeholder block for "nothing here yet" states,
 * generalized from the "No Framework Detected" block on the Dashboard.
 */
export function EmptyState({ icon: Icon, message, className = "h-32" }: EmptyStateProps): ReactElement {
  return (
    <div className={`flex flex-col items-center justify-center text-gray-400 text-sm border-2 border-dashed border-white/5 rounded-lg ${className}`}>
      <Icon size={24} className="mb-2 opacity-50" />
      <span>{message}</span>
    </div>
  );
}
