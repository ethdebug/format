/**
 * Navigation controls for stepping through an execution trace.
 */

import React from "react";
import { useTraceContext } from "./TraceContext.js";

// CSS is expected to be imported by the consuming application
// import "./TraceControls.css";

export interface TraceControlsProps {
  /** Whether to show step count label */
  showStepCount?: boolean;
  /** Whether to show the opcode label */
  showOpcode?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Navigation controls for trace stepping.
 */
export function TraceControls({
  showStepCount = true,
  showOpcode = true,
  className = "",
}: TraceControlsProps): JSX.Element {
  const {
    currentStepIndex,
    totalSteps,
    currentStep,
    isAtStart,
    isAtEnd,
    stepBackward,
    stepForward,
    reset,
    jumpToEnd,
  } = useTraceContext();

  return (
    <div className={`trace-controls ${className}`.trim()}>
      <div className="trace-controls-navigation">
        <button
          className="trace-control-btn trace-control-reset"
          onClick={reset}
          disabled={isAtStart}
          title="Reset to start"
          type="button"
        >
          ⏮
        </button>
        <button
          className="trace-control-btn trace-control-prev"
          onClick={stepBackward}
          disabled={isAtStart}
          title="Previous step"
          type="button"
        >
          ←
        </button>
        <button
          className="trace-control-btn trace-control-next"
          onClick={stepForward}
          disabled={isAtEnd}
          title="Next step"
          type="button"
        >
          →
        </button>
        <button
          className="trace-control-btn trace-control-end"
          onClick={jumpToEnd}
          disabled={isAtEnd}
          title="Jump to end"
          type="button"
        >
          ⏭
        </button>
      </div>

      {showStepCount && (
        <div className="trace-controls-info">
          <span className="trace-step-counter">
            Step {currentStepIndex + 1} / {totalSteps}
          </span>
          {showOpcode && currentStep && (
            <span className="trace-current-opcode">
              <code>{currentStep.opcode}</code>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface TraceProgressProps {
  /** Custom class name */
  className?: string;
}

/**
 * Progress bar showing current position in trace.
 */
export function TraceProgress({
  className = "",
}: TraceProgressProps): JSX.Element {
  const { currentStepIndex, totalSteps, jumpToStep } = useTraceContext();

  const progress = totalSteps > 1 ? currentStepIndex / (totalSteps - 1) : 0;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const step = Math.round(percent * (totalSteps - 1));
    jumpToStep(step);
  };

  return (
    <div
      className={`trace-progress ${className}`.trim()}
      onClick={handleClick}
      role="progressbar"
      aria-valuenow={currentStepIndex + 1}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          jumpToStep(Math.min(currentStepIndex + 1, totalSteps - 1));
        } else if (e.key === "ArrowLeft") {
          jumpToStep(Math.max(currentStepIndex - 1, 0));
        }
      }}
    >
      <div
        className="trace-progress-fill"
        style={{ width: `${progress * 100}%` }}
      />
      <div
        className="trace-progress-handle"
        style={{ left: `${progress * 100}%` }}
      />
    </div>
  );
}
