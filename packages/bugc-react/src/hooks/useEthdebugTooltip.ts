/**
 * Hook for managing ethdebug tooltip state.
 */

import React, { useState, useCallback } from "react";
import type { TooltipData } from "#types";

/**
 * State and handlers returned by useEthdebugTooltip.
 */
export interface UseEthdebugTooltipResult {
  /** Current tooltip data, if any */
  tooltip: TooltipData | null;
  /** Set tooltip data directly */
  setTooltip: React.Dispatch<React.SetStateAction<TooltipData | null>>;
  /** Show tooltip at element position */
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  /** Show and pin tooltip at element position */
  pinTooltip: (e: React.MouseEvent<HTMLElement>, content: string) => void;
  /** Hide tooltip if not pinned */
  hideTooltip: () => void;
  /** Close tooltip regardless of pinned state */
  closeTooltip: () => void;
}

/**
 * Hook for managing tooltip display state.
 *
 * Provides state and handlers for showing, hiding, pinning, and unpinning
 * tooltips in debug information displays.
 *
 * @returns Tooltip state and control functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { tooltip, setTooltip, showTooltip, hideTooltip, closeTooltip } =
 *     useEthdebugTooltip();
 *
 *   return (
 *     <div>
 *       <span
 *         onMouseEnter={(e) => showTooltip(e, "Debug info here")}
 *         onMouseLeave={hideTooltip}
 *         onClick={(e) => pinTooltip(e, "Debug info here")}
 *       >
 *         Hover me
 *       </span>
 *       <EthdebugTooltip
 *         tooltip={tooltip}
 *         onUpdate={setTooltip}
 *         onClose={closeTooltip}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useEthdebugTooltip(): UseEthdebugTooltipResult {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const showTooltip = useCallback(
    (e: React.MouseEvent<HTMLElement>, content: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        content,
        x: rect.left,
        y: rect.bottom,
        pinned: false,
      });
    },
    [],
  );

  const pinTooltip = useCallback(
    (e: React.MouseEvent<HTMLElement>, content: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        content,
        x: rect.left,
        y: rect.bottom,
        pinned: true,
      });
    },
    [],
  );

  const hideTooltip = useCallback(() => {
    setTooltip((current) => {
      if (current?.pinned) {
        return current;
      }
      return null;
    });
  }, []);

  const closeTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  return {
    tooltip,
    setTooltip,
    showTooltip,
    pinTooltip,
    hideTooltip,
    closeTooltip,
  };
}
