// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shared "this isn't real hardware data" banner for System Health tabs
 * that render live-looking numbers not actually wired to the EC yet.
 * Deliberately not dismissible, unlike LightingTab's confidence-caveat
 * banner: that one warns about label accuracy once; this one warns that
 * the values themselves are fabricated, which stays true every time the
 * tab renders until real EC polling replaces it — dismissing it once
 * shouldn't make it stop applying on a later visit.
 */
import type { ReactElement, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface SimulatedDataNoticeProps {
  children: ReactNode;
}

export function SimulatedDataNotice({ children }: SimulatedDataNoticeProps): ReactElement {
  return (
    <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs leading-relaxed">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
