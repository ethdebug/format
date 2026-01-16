/**
 * Component for inspecting variables in scope at the current trace step.
 */

import React from "react";
import { useTraceContext, type ResolvedVariable } from "./TraceContext.js";

// CSS is expected to be imported by the consuming application
// import "./VariableInspector.css";

export interface VariableInspectorProps {
  /** Whether to show variable types */
  showTypes?: boolean;
  /** Whether to show pointers */
  showPointers?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Displays variables in scope at the current execution step.
 */
export function VariableInspector({
  showTypes = false,
  showPointers = false,
  className = "",
}: VariableInspectorProps): JSX.Element {
  const { currentVariables, currentInstruction } = useTraceContext();

  if (!currentInstruction) {
    return (
      <div
        className={`variable-inspector variable-inspector-empty ${className}`.trim()}
      >
        <span className="variable-inspector-empty-text">
          No instruction selected
        </span>
      </div>
    );
  }

  if (currentVariables.length === 0) {
    return (
      <div
        className={`variable-inspector variable-inspector-empty ${className}`.trim()}
      >
        <span className="variable-inspector-empty-text">
          No variables in scope
        </span>
      </div>
    );
  }

  return (
    <div className={`variable-inspector ${className}`.trim()}>
      <div className="variable-inspector-list">
        {currentVariables.map((variable, index) => (
          <VariableItem
            key={variable.identifier || index}
            variable={variable}
            showType={showTypes}
            showPointer={showPointers}
          />
        ))}
      </div>
    </div>
  );
}

interface VariableItemProps {
  variable: ResolvedVariable;
  showType: boolean;
  showPointer: boolean;
}

function VariableItem({
  variable,
  showType,
  showPointer,
}: VariableItemProps): JSX.Element {
  const { identifier, type, pointer, value, error } = variable;

  // Extract type name if available
  const typeName =
    type && typeof type === "object" && "kind" in type
      ? (type as { kind: string }).kind
      : type
        ? JSON.stringify(type)
        : undefined;

  return (
    <div className={`variable-item ${error ? "has-error" : ""}`}>
      <div className="variable-header">
        <span className="variable-name">{identifier || "(anonymous)"}</span>
        {typeName && showType && (
          <span className="variable-type">{typeName}</span>
        )}
      </div>

      <div className="variable-value">
        {error ? (
          <span className="variable-error" title={error}>
            Error: {error}
          </span>
        ) : value !== undefined ? (
          <code className="variable-resolved">{value}</code>
        ) : (
          <span className="variable-pending">(value not resolved)</span>
        )}
      </div>

      {showPointer && !!pointer && (
        <div className="variable-pointer">
          <details>
            <summary>Pointer</summary>
            <pre className="variable-pointer-json">
              {JSON.stringify(pointer, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export interface StackInspectorProps {
  /** Maximum stack entries to show */
  maxEntries?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Displays the EVM stack at the current trace step.
 */
export function StackInspector({
  maxEntries = 10,
  className = "",
}: StackInspectorProps): JSX.Element {
  const { currentStep } = useTraceContext();

  if (!currentStep || !currentStep.stack || currentStep.stack.length === 0) {
    return (
      <div
        className={`stack-inspector stack-inspector-empty ${className}`.trim()}
      >
        <span className="stack-inspector-empty-text">Empty stack</span>
      </div>
    );
  }

  const stack = currentStep.stack;
  const displayStack = stack.slice(0, maxEntries);
  const hasMore = stack.length > maxEntries;

  return (
    <div className={`stack-inspector ${className}`.trim()}>
      <div className="stack-inspector-list">
        {displayStack.map((entry, index) => (
          <div key={index} className="stack-entry">
            <span className="stack-index">[{index}]</span>
            <code className="stack-value">
              {typeof entry === "bigint" ? `0x${entry.toString(16)}` : entry}
            </code>
          </div>
        ))}
        {hasMore && (
          <div className="stack-entry stack-more">
            ... {stack.length - maxEntries} more entries
          </div>
        )}
      </div>
    </div>
  );
}
