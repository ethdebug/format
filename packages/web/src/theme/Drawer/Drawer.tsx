/**
 * Shared Drawer component for bottom-of-viewport pull-out panels.
 *
 * Features:
 * - Fixed at bottom of viewport
 * - Resizable by dragging the top edge
 * - Full-screen on mobile
 * - Keyboard accessible (Escape to close)
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

import "./Drawer.css";

const MIN_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.85;
const DEFAULT_HEIGHT_RATIO = 0.45;

export interface DrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
  /** Callback to toggle open/closed */
  onToggle: () => void;
  /** Title shown in the header */
  title: string;
  /** Header actions (buttons, etc.) rendered after title */
  headerActions?: ReactNode;
  /** Main content of the drawer */
  children: ReactNode;
  /** Optional className for styling variants */
  className?: string;
}

export function Drawer({
  isOpen,
  onClose,
  onToggle,
  title,
  headerActions,
  children,
  className = "",
}: DrawerProps): JSX.Element {
  const [height, setHeight] = useState(() =>
    typeof window !== "undefined"
      ? Math.round(window.innerHeight * DEFAULT_HEIGHT_RATIO)
      : 400,
  );
  const [isResizing, setIsResizing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Handle resize drag
  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsResizing(true);
    },
    [],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const windowHeight = window.innerHeight;
      const newHeight = windowHeight - clientY;
      const maxHeight = windowHeight * MAX_HEIGHT_RATIO;

      setHeight(Math.max(MIN_HEIGHT, Math.min(newHeight, maxHeight)));
    };

    const handleEnd = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleMove);
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [isResizing]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const baseClass = `drawer ${className}`.trim();

  // When closed, render a simple bar
  if (!isOpen) {
    return (
      <div
        ref={drawerRef}
        className={`${baseClass} closed`}
        style={{ "--drawer-height": `${height}px` } as React.CSSProperties}
      >
        <div className="drawer-header">
          <button
            className="drawer-toggle"
            onClick={onToggle}
            type="button"
            aria-expanded={false}
            aria-label={`Open ${title}`}
          >
            <span className="drawer-toggle-icon">&#9650;</span>
            <span className="drawer-toggle-text">{title}</span>
          </button>
        </div>
      </div>
    );
  }

  // When open, show full drawer
  return (
    <div
      ref={drawerRef}
      className={`${baseClass} open ${isResizing ? "resizing" : ""}`}
      style={{ "--drawer-height": `${height}px` } as React.CSSProperties}
    >
      {/* Resize handle */}
      <div
        className="drawer-resize-handle"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      >
        <div className="drawer-resize-bar" />
      </div>

      <div className="drawer-header">
        <button
          className="drawer-toggle"
          onClick={onToggle}
          type="button"
          aria-expanded={true}
          aria-label={`Close ${title}`}
        >
          <span className="drawer-toggle-icon">&#9660;</span>
          <span className="drawer-toggle-text">{title}</span>
        </button>

        <div className="drawer-header-actions">
          {headerActions}
          <button
            className="drawer-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="drawer-content">{children}</div>
    </div>
  );
}

export default Drawer;
