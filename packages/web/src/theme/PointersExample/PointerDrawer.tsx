/**
 * A pull-out drawer for the pointer resolution widget.
 *
 * - Fixed at bottom of viewport
 * - Resizable by dragging the top edge
 * - Full-screen on mobile
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import {
  PointerResolverProvider,
  ResolutionVisualizer,
  usePointerResolverContext,
} from "@ethdebug/pointers-react";
import { usePointerPlayground } from "./PointerPlaygroundContext";

import "./PointerDrawer.css";

const MIN_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.85;
const DEFAULT_HEIGHT_RATIO = 0.4;

export function PointerDrawer(): JSX.Element {
  return (
    <BrowserOnly fallback={null}>{() => <PointerDrawerContent />}</BrowserOnly>
  );
}

function PointerDrawerContent(): JSX.Element {
  const { pointer, stateSpec, isOpen, toggleDrawer, closeDrawer } =
    usePointerPlayground();

  const [height, setHeight] = useState(() =>
    Math.round(window.innerHeight * DEFAULT_HEIGHT_RATIO),
  );
  const [isResizing, setIsResizing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Key to force re-mount of provider when example changes
  const [providerKey, setProviderKey] = useState(0);

  // Re-mount provider when pointer/state changes from context
  useEffect(() => {
    setProviderKey((k) => k + 1);
  }, [pointer, stateSpec]);

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
        closeDrawer();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeDrawer]);

  // When closed, render a simple bar
  if (!isOpen) {
    return (
      <div
        ref={drawerRef}
        className="pointer-drawer closed"
        style={{ "--drawer-height": `${height}px` } as React.CSSProperties}
      >
        <div className="pointer-drawer-header">
          <button
            className="pointer-drawer-toggle"
            onClick={toggleDrawer}
            type="button"
            aria-expanded={false}
            aria-label="Open pointer playground"
          >
            <span className="toggle-icon">▲</span>
            <span className="toggle-text">Pointer Playground</span>
          </button>
        </div>
      </div>
    );
  }

  // When open, show full drawer with provider
  return (
    <div
      ref={drawerRef}
      className={`pointer-drawer open ${isResizing ? "resizing" : ""}`}
      style={{ "--drawer-height": `${height}px` } as React.CSSProperties}
    >
      {/* Resize handle */}
      <div
        className="pointer-drawer-resize-handle"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      >
        <div className="resize-handle-bar" />
      </div>

      <PointerResolverProvider
        key={providerKey}
        initialPointer={pointer}
        initialStateSpec={stateSpec}
        autoResolve={true}
      >
        <DrawerHeader toggleDrawer={toggleDrawer} closeDrawer={closeDrawer} />
        <div className="pointer-drawer-content">
          <ResolutionVisualizer
            showPointerInput={true}
            showStateEditor={true}
            showControls={false}
            showFullValues={false}
          />
        </div>
      </PointerResolverProvider>
    </div>
  );
}

interface DrawerHeaderProps {
  toggleDrawer: () => void;
  closeDrawer: () => void;
}

/**
 * Header with resolve button that needs access to resolver context.
 */
function DrawerHeader({
  toggleDrawer,
  closeDrawer,
}: DrawerHeaderProps): JSX.Element {
  const { pointer, isResolving, resolve } = usePointerResolverContext();

  return (
    <div className="pointer-drawer-header">
      <button
        className="pointer-drawer-toggle"
        onClick={toggleDrawer}
        type="button"
        aria-expanded={true}
        aria-label="Close pointer playground"
      >
        <span className="toggle-icon">▼</span>
        <span className="toggle-text">Pointer Playground</span>
      </button>

      <div className="pointer-drawer-header-actions">
        <button
          className="resolve-button"
          onClick={() => resolve()}
          disabled={isResolving || !pointer}
          type="button"
        >
          {isResolving ? "Resolving..." : "Resolve Pointer"}
        </button>

        <button
          className="pointer-drawer-close"
          onClick={closeDrawer}
          type="button"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default PointerDrawer;
