/**
 * PointerResolver component for the Docusaurus site.
 *
 * Provides an interactive pointer resolution visualizer with theming.
 */

import React from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import type { Pointer } from "@ethdebug/format";
import {
  PointerResolverProvider,
  ResolutionVisualizer,
  type MockStateSpec,
} from "@ethdebug/pointers-react";

// Import CSS for styling
import "./variables.css";
import "./ResolutionVisualizer.css";
import "./RegionMap.css";
import "./RegionOutput.css";

export interface PointerResolverProps {
  /** Initial pointer definition to resolve */
  initialPointer?: Pointer;
  /** Initial machine state specification */
  initialState?: MockStateSpec;
  /** Whether to show the pointer JSON input */
  showPointerInput?: boolean;
  /** Whether to show the state editor */
  showStateEditor?: boolean;
  /** Whether to show full hex values */
  showFullValues?: boolean;
  /** Custom height for the component */
  height?: string;
}

/**
 * Interactive pointer resolution visualizer.
 */
export function PointerResolver({
  initialPointer,
  initialState = {},
  showPointerInput = true,
  showStateEditor = true,
  showFullValues = false,
  height,
}: PointerResolverProps): JSX.Element {
  return (
    <BrowserOnly
      fallback={
        <div className="pointer-resolver-loading">
          Loading pointer resolver...
        </div>
      }
    >
      {() => (
        <div
          className="pointer-resolver"
          style={height ? { height } : undefined}
        >
          <PointerResolverProvider
            initialPointer={initialPointer || null}
            initialStateSpec={initialState}
            autoResolve={true}
          >
            <ResolutionVisualizer
              showPointerInput={showPointerInput}
              showStateEditor={showStateEditor}
              showFullValues={showFullValues}
            />
          </PointerResolverProvider>
        </div>
      )}
    </BrowserOnly>
  );
}

export interface SimplePointerDisplayProps {
  /** Pointer definition to display */
  pointer: Pointer;
  /** Machine state to resolve against */
  state: MockStateSpec;
  /** Whether to show full hex values */
  showFullValues?: boolean;
}

/**
 * Simple read-only pointer display without editing capabilities.
 */
export function SimplePointerDisplay({
  pointer,
  state,
  showFullValues = false,
}: SimplePointerDisplayProps): JSX.Element {
  return (
    <BrowserOnly
      fallback={<div className="pointer-resolver-loading">Loading...</div>}
    >
      {() => (
        <div className="pointer-resolver pointer-resolver-simple">
          <PointerResolverProvider
            initialPointer={pointer}
            initialStateSpec={state}
            autoResolve={true}
          >
            <ResolutionVisualizer
              showPointerInput={false}
              showStateEditor={false}
              showFullValues={showFullValues}
            />
          </PointerResolverProvider>
        </div>
      )}
    </BrowserOnly>
  );
}
