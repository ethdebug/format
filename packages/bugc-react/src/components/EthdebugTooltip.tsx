/**
 * Tooltip component for displaying ethdebug debug information.
 */

import React, { useRef, useEffect } from "react";
import type { TooltipData } from "#types";
import "./EthdebugTooltip.css";

/**
 * Props for EthdebugTooltip component.
 */
export interface EthdebugTooltipProps {
  /** Tooltip data to display, or null to hide */
  tooltip: TooltipData | null;
  /** Callback to update tooltip position */
  onUpdate?: (tooltip: TooltipData) => void;
  /** Callback when tooltip is closed */
  onClose?: () => void;
}

/**
 * Displays debug information in a floating tooltip.
 *
 * Automatically adjusts position to stay within viewport bounds.
 * When pinned, the tooltip stays in place and can be closed manually.
 *
 * @param props - Tooltip data and callbacks
 * @returns Tooltip element or null
 *
 * @example
 * ```tsx
 * const { tooltip, setTooltip, closeTooltip } = useEthdebugTooltip();
 *
 * <EthdebugTooltip
 *   tooltip={tooltip}
 *   onUpdate={setTooltip}
 *   onClose={closeTooltip}
 * />
 * ```
 */
export function EthdebugTooltip({
  tooltip,
  onUpdate,
  onClose,
}: EthdebugTooltipProps): JSX.Element | null {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tooltip && tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let { x, y } = tooltip;

      // Adjust horizontal position if tooltip goes off right edge
      if (x + tooltipRect.width > viewportWidth) {
        x = viewportWidth - tooltipRect.width - 10;
      }

      // Adjust horizontal position if tooltip goes off left edge
      if (x < 10) {
        x = 10;
      }

      // Adjust vertical position if tooltip goes off bottom edge
      if (y + tooltipRect.height > viewportHeight) {
        y = viewportHeight - tooltipRect.height - 10;
      }

      // Adjust vertical position if tooltip goes off top edge
      if (y < 10) {
        y = 10;
      }

      // Update position if it changed
      if (x !== tooltip.x || y !== tooltip.y) {
        onUpdate?.({ ...tooltip, x, y });
      }
    }
  }, [tooltip, onUpdate]);

  if (!tooltip) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className={`ethdebug-tooltip ${tooltip.pinned ? "pinned" : ""}`}
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
      }}
    >
      {tooltip.pinned && (
        <button
          className="tooltip-close-btn"
          onClick={onClose}
          title="Close (Esc)"
        >
          ×
        </button>
      )}
      <pre>{tooltip.content}</pre>
    </div>
  );
}

/**
 * Props for DebugInfoIcon component.
 */
export interface DebugInfoIconProps {
  /** Callback when icon is hovered */
  onMouseEnter: (e: React.MouseEvent<HTMLSpanElement>) => void;
  /** Callback when hover ends */
  onMouseLeave: () => void;
  /** Callback when icon is clicked (for pinning) */
  onClick: (e: React.MouseEvent<HTMLSpanElement>) => void;
}

/**
 * Small icon indicating debug information is available.
 *
 * @param props - Event handlers
 * @returns Icon element
 */
export function DebugInfoIcon({
  onMouseEnter,
  onMouseLeave,
  onClick,
}: DebugInfoIconProps): JSX.Element {
  return (
    <span
      className="debug-info-icon"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      title="Click to pin debug info"
    >
      ℹ
    </span>
  );
}

/**
 * Spacer element to maintain alignment when no debug icon is shown.
 */
export function DebugInfoSpacer(): JSX.Element {
  return <span className="debug-info-spacer" />;
}
