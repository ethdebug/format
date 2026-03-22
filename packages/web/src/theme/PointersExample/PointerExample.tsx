/**
 * A pointer example with a "Try it" button that loads into the drawer.
 */

import React from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import CodeBlock from "@theme/CodeBlock";
import type { Pointer } from "@ethdebug/format";
import type { MockStateSpec } from "@ethdebug/pointers-react";
import { usePointerPlaygroundOptional } from "./PointerPlaygroundContext";

import "./PointerExample.css";

export interface PointerExampleProps {
  /** The pointer to demonstrate */
  pointer: Pointer;
  /** Optional machine state for the example */
  state?: MockStateSpec;
  /** Optional title for the example */
  title?: string;
  /** Optional description */
  description?: string;
  /** Whether to show the JSON code block (default: true) */
  showCode?: boolean;
}

export function PointerExample({
  pointer,
  state = {},
  title,
  description,
  showCode = true,
}: PointerExampleProps): JSX.Element {
  const pointerJson = JSON.stringify(pointer, null, 2);

  return (
    <div className="pointer-example">
      {title && <div className="pointer-example-title">{title}</div>}
      {description && (
        <div className="pointer-example-description">{description}</div>
      )}

      <div className="pointer-example-content">
        {showCode && (
          <CodeBlock language="json" className="pointer-example-code">
            {pointerJson}
          </CodeBlock>
        )}

        <BrowserOnly fallback={null}>
          {() => (
            <TryItButton pointer={pointer} state={state} showCode={showCode} />
          )}
        </BrowserOnly>
      </div>
    </div>
  );
}

interface TryItButtonProps {
  pointer: Pointer;
  state: MockStateSpec;
  showCode: boolean;
}

function TryItButton({
  pointer,
  state,
  showCode,
}: TryItButtonProps): JSX.Element | null {
  const playground = usePointerPlaygroundOptional();

  if (!playground) {
    return null;
  }

  const handleClick = () => {
    playground.loadExample(pointer, state);
  };

  return (
    <button
      className={`pointer-example-try-btn ${showCode ? "" : "standalone"}`}
      onClick={handleClick}
      type="button"
      title="Load this example in the Pointer Playground"
    >
      <span className="try-btn-icon">▶</span>
      <span className="try-btn-text">Try it</span>
    </button>
  );
}

export default PointerExample;
