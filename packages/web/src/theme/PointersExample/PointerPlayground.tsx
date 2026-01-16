/**
 * Wrapper component that provides the playground context and drawer.
 *
 * Use this to wrap page content that contains PointerExample components.
 */

import React, { type ReactNode } from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import type { Pointer } from "@ethdebug/format";
import type { MockStateSpec } from "@ethdebug/pointers-react";
import { PointerPlaygroundProvider } from "./PointerPlaygroundContext";
import { PointerDrawer } from "./PointerDrawer";

import "./PointerDrawer.css";

export interface PointerPlaygroundProps {
  children: ReactNode;
  /** Initial pointer to show in drawer (optional) */
  initialPointer?: Pointer;
  /** Initial state for the drawer (optional) */
  initialState?: MockStateSpec;
}

export function PointerPlayground({
  children,
  initialPointer,
  initialState,
}: PointerPlaygroundProps): JSX.Element {
  return (
    <BrowserOnly
      fallback={<div className="pointer-playground-fallback">{children}</div>}
    >
      {() => (
        <PointerPlaygroundProvider
          initialPointer={initialPointer ?? null}
          initialState={initialState}
          initialOpen={false}
        >
          <div className="pointer-playground-content">{children}</div>
          <PointerDrawer />
        </PointerPlaygroundProvider>
      )}
    </BrowserOnly>
  );
}

export default PointerPlayground;
