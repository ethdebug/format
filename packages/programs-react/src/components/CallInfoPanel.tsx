/**
 * Panel showing call context info for the current instruction.
 *
 * Displays a banner for invoke/return/revert events and
 * lists resolved pointer ref values (arguments, return
 * data, etc.).
 */

import React from "react";
import {
  useTraceContext,
  type ResolvedCallInfo,
  type ResolvedPointerRef,
} from "./TraceContext.js";

// CSS is expected to be imported by the consuming application
// import "./CallInfoPanel.css";

export interface CallInfoPanelProps {
  /** Whether to show raw pointer JSON */
  showPointers?: boolean;
  /** Custom class name */
  className?: string;
}

function formatBanner(info: ResolvedCallInfo): string {
  const name = info.identifier || "(anonymous)";

  if (info.kind === "invoke") {
    const prefix =
      info.callType === "external"
        ? "Calling (external)"
        : info.callType === "create"
          ? "Creating"
          : "Calling";
    return `${prefix} ${name}()`;
  }

  if (info.kind === "return") {
    return `Returned from ${name}()`;
  }

  // revert
  if (info.panic !== undefined) {
    return `Reverted: panic 0x${info.panic.toString(16)}`;
  }
  return `Reverted in ${name}()`;
}

function bannerClassName(kind: ResolvedCallInfo["kind"]): string {
  if (kind === "invoke") {
    return "call-info-banner-invoke";
  }
  if (kind === "return") {
    return "call-info-banner-return";
  }
  return "call-info-banner-revert";
}

/**
 * Shows call context info when the current instruction
 * has an invoke, return, or revert context.
 */
export function CallInfoPanel({
  showPointers = false,
  className = "",
}: CallInfoPanelProps): JSX.Element | null {
  const { currentCallInfo } = useTraceContext();

  if (!currentCallInfo) {
    return null;
  }

  return (
    <div className={`call-info-panel ${className}`.trim()}>
      <div
        className={`call-info-banner ${bannerClassName(currentCallInfo.kind)}`}
      >
        {formatBanner(currentCallInfo)}
      </div>

      {currentCallInfo.pointerRefs.length > 0 && (
        <div className="call-info-refs">
          {currentCallInfo.pointerRefs.map((ref) => (
            <PointerRefItem
              key={ref.label}
              ref_={ref}
              showPointer={showPointers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PointerRefItemProps {
  ref_: ResolvedPointerRef;
  showPointer: boolean;
}

function PointerRefItem({
  ref_,
  showPointer,
}: PointerRefItemProps): JSX.Element {
  return (
    <div className="call-info-ref">
      <span className="call-info-ref-label">{ref_.label}:</span>
      <span className="call-info-ref-value">
        {ref_.error ? (
          <span className="call-info-ref-error" title={ref_.error}>
            Error: {ref_.error}
          </span>
        ) : ref_.value !== undefined ? (
          <code className="call-info-ref-resolved">{ref_.value}</code>
        ) : (
          <span className="call-info-ref-pending">(resolving...)</span>
        )}
      </span>

      {showPointer && !!ref_.pointer && (
        <details className="call-info-ref-pointer">
          <summary>Pointer</summary>
          <pre className="call-info-ref-pointer-json">
            {JSON.stringify(ref_.pointer, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
