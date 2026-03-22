/**
 * Wrapper component that provides the trace playground context and drawer.
 *
 * Use this to wrap page content that contains TraceExample components.
 */

import React, { type ReactNode } from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import {
  TracePlaygroundProvider,
  type TraceExampleData,
} from "./TracePlaygroundContext";
import { TraceDrawer } from "./TraceDrawer";

export interface TracePlaygroundProps {
  children: ReactNode;
  /** Initial example to load (optional) */
  initialExample?: TraceExampleData;
}

export function TracePlayground({
  children,
  initialExample,
}: TracePlaygroundProps): JSX.Element {
  return (
    <BrowserOnly
      fallback={<div className="trace-playground-fallback">{children}</div>}
    >
      {() => (
        <TracePlaygroundProvider
          initialExample={initialExample ?? null}
          initialOpen={false}
        >
          <div className="trace-playground-content">{children}</div>
          <TraceDrawer />
        </TracePlaygroundProvider>
      )}
    </BrowserOnly>
  );
}

export default TracePlayground;
