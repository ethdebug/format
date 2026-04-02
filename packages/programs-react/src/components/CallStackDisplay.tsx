/**
 * Displays the current call stack as a breadcrumb trail.
 */

import React from "react";
import { useTraceContext } from "./TraceContext.js";

// CSS is expected to be imported by the consuming application
// import "./CallStackDisplay.css";

export interface CallStackDisplayProps {
  /** Custom class name */
  className?: string;
}

/**
 * Renders the call stack as a breadcrumb.
 *
 * Shows function names separated by arrows, e.g.:
 *   main() -> transfer() -> _update()
 */
function formatArgs(
  frame: { identifier?: string; stepIndex: number },
  resolvedCallStack: Array<{
    stepIndex: number;
    resolvedArgs?: Array<{
      name: string;
      value?: string;
    }>;
  }>,
): string {
  const resolved = resolvedCallStack.find(
    (r) => r.stepIndex === frame.stepIndex,
  );
  if (!resolved?.resolvedArgs) {
    return "";
  }
  return resolved.resolvedArgs
    .map((arg) => {
      if (arg.value === undefined) {
        return arg.name;
      }
      const decimal = formatAsDecimal(arg.value);
      return `${arg.name}: ${decimal}`;
    })
    .join(", ");
}

function formatAsDecimal(hex: string): string {
  try {
    const n = BigInt(hex);
    if (n <= 9999n) {
      return n.toString();
    }
    return hex;
  } catch {
    return hex;
  }
}

export function CallStackDisplay({
  className = "",
}: CallStackDisplayProps): JSX.Element {
  const { callStack, resolvedCallStack, jumpToStep } = useTraceContext();

  if (callStack.length === 0) {
    return (
      <div className={`call-stack call-stack-empty ${className}`.trim()}>
        <span className="call-stack-empty-text">(top level)</span>
      </div>
    );
  }

  return (
    <div className={`call-stack ${className}`.trim()}>
      <div className="call-stack-breadcrumb">
        {callStack.map((frame, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <span className="call-stack-separator">{" -> "}</span>
            )}
            <button
              className="call-stack-frame"
              onClick={() => jumpToStep(frame.stepIndex)}
              title={
                `Step ${frame.stepIndex + 1}` +
                (frame.callType ? ` (${frame.callType})` : "")
              }
              type="button"
            >
              <span className="call-stack-name">
                {frame.identifier || "(anonymous)"}
              </span>
              <span className="call-stack-parens">
                ({formatArgs(frame, resolvedCallStack)})
              </span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
