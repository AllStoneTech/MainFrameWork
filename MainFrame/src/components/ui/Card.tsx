// SPDX-License-Identifier: GPL-3.0-or-later
/** Shared dark glass panel container primitive used across MainFrameWork's pages. */
import type { HTMLAttributes, ReactElement, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Standard dark glass panel container used throughout MainFrameWork.
 * Wraps the `bg-[#2a2a2a] rounded-xl border border-white/5 shadow-xl`
 * pattern that was previously duplicated on every page.
 */
export function Card({ children, className = "", ...rest }: CardProps): ReactElement {
  return (
    <div
      className={`bg-[#2a2a2a] rounded-xl border border-white/5 shadow-xl ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
