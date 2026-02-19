/**
 * A trace example card with BUG code and a "Try it" button.
 */

import React from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import CodeBlock from "@theme/CodeBlock";
import { useTracePlaygroundOptional } from "./TracePlaygroundContext";

import "./TraceExample.css";

export interface TraceExampleProps {
  /** BUG source code */
  source: string;
  /** Optional title for the example */
  title?: string;
  /** Optional description */
  description?: string;
  /** Whether to show the code preview (default: true) */
  showPreview?: boolean;
}

export function TraceExample({
  source,
  title,
  description,
  showPreview = true,
}: TraceExampleProps): JSX.Element {
  return (
    <div className="trace-example">
      {title && <div className="trace-example-title">{title}</div>}
      {description && (
        <div className="trace-example-description">{description}</div>
      )}

      <div className="trace-example-content">
        {showPreview && (
          <div className="trace-example-code">
            <CodeBlock language="javascript">{source.trim()}</CodeBlock>
          </div>
        )}

        <BrowserOnly fallback={null}>
          {() => <TryItButton source={source} title={title} />}
        </BrowserOnly>
      </div>
    </div>
  );
}

interface TryItButtonProps {
  source: string;
  title?: string;
}

function TryItButton({ source, title }: TryItButtonProps): JSX.Element | null {
  const playground = useTracePlaygroundOptional();

  if (!playground) {
    return null;
  }

  const handleClick = () => {
    playground.loadExample({ source, title });
  };

  return (
    <button
      className="trace-example-try-btn"
      onClick={handleClick}
      type="button"
      title="Load this example in the Trace Playground"
    >
      <span className="try-btn-icon">&#x25B6;</span>
      <span className="try-btn-text">Try it</span>
    </button>
  );
}

export default TraceExample;
