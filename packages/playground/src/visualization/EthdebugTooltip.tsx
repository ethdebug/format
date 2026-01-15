import { useState, useRef, useEffect } from "react";
import "./EthdebugTooltip.css";

export interface TooltipData {
  content: string;
  x: number;
  y: number;
  pinned?: boolean;
}

interface EthdebugTooltipProps {
  tooltip: TooltipData | null;
  onUpdate?: (tooltip: TooltipData) => void;
  onClose?: () => void;
}

export function EthdebugTooltip({
  tooltip,
  onUpdate,
  onClose,
}: EthdebugTooltipProps) {
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

export function useEthdebugTooltip() {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const showTooltip = (e: React.MouseEvent<HTMLElement>, content: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      content,
      x: rect.left,
      y: rect.bottom,
      pinned: false,
    });
  };

  const pinTooltip = (e: React.MouseEvent<HTMLElement>, content: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      content,
      x: rect.left,
      y: rect.bottom,
      pinned: true,
    });
  };

  const hideTooltip = () => {
    if (!tooltip?.pinned) {
      setTooltip(null);
    }
  };

  const closeTooltip = () => {
    setTooltip(null);
  };

  return {
    tooltip,
    setTooltip,
    showTooltip,
    pinTooltip,
    hideTooltip,
    closeTooltip,
  };
}
