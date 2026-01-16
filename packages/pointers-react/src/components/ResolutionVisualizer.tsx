/**
 * Main component for visualizing pointer resolution.
 */

import React, { useState, useCallback } from "react";
import type { Pointer } from "@ethdebug/format";
import { usePointerResolverContext } from "./PointerResolverContext.js";
import { RegionMap } from "./RegionMap.js";
import { RegionOutput } from "./RegionOutput.js";

export interface ResolutionVisualizerProps {
  /** Whether to show the pointer JSON input */
  showPointerInput?: boolean;
  /** Whether to show the state editor */
  showStateEditor?: boolean;
  /** Whether to show full hex values */
  showFullValues?: boolean;
}

/**
 * Component for editing a storage state map.
 */
function StorageEditor({
  storage,
  onChange,
}: {
  storage: Record<string, string>;
  onChange: (storage: Record<string, string>) => void;
}): JSX.Element {
  const entries = Object.entries(storage);

  const handleSlotChange = (oldSlot: string, newSlot: string) => {
    const newStorage = { ...storage };
    const value = newStorage[oldSlot];
    delete newStorage[oldSlot];
    if (newSlot) {
      newStorage[newSlot] = value;
    }
    onChange(newStorage);
  };

  const handleValueChange = (slot: string, value: string) => {
    onChange({ ...storage, [slot]: value });
  };

  const handleAdd = () => {
    const newSlot = `0x${entries.length.toString(16).padStart(2, "0")}`;
    onChange({ ...storage, [newSlot]: "0x00" });
  };

  const handleRemove = (slot: string) => {
    const newStorage = { ...storage };
    delete newStorage[slot];
    onChange(newStorage);
  };

  return (
    <div className="state-editor-section">
      <div className="state-editor-header">
        <span>Storage</span>
        <button
          className="state-editor-add-btn"
          onClick={handleAdd}
          type="button"
        >
          + Add
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="state-editor-empty">No storage entries</div>
      ) : (
        <div className="state-editor-entries">
          {entries.map(([slot, value]) => (
            <div key={slot} className="state-editor-entry">
              <input
                className="state-editor-input slot"
                value={slot}
                onChange={(e) => handleSlotChange(slot, e.target.value)}
                placeholder="slot (hex)"
              />
              <span className="state-editor-arrow">=</span>
              <input
                className="state-editor-input value"
                value={value}
                onChange={(e) => handleValueChange(slot, e.target.value)}
                placeholder="value (hex)"
              />
              <button
                className="state-editor-remove-btn"
                onClick={() => handleRemove(slot)}
                type="button"
                aria-label="Remove entry"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Component for editing stack entries.
 */
function StackEditor({
  stack,
  onChange,
}: {
  stack: Array<string | bigint>;
  onChange: (stack: Array<string | bigint>) => void;
}): JSX.Element {
  const handleEntryChange = (index: number, value: string) => {
    const newStack = [...stack];
    newStack[index] = value;
    onChange(newStack);
  };

  const handleAdd = () => {
    onChange([...stack, "0x00"]);
  };

  const handleRemove = (index: number) => {
    const newStack = [...stack];
    newStack.splice(index, 1);
    onChange(newStack);
  };

  return (
    <div className="state-editor-section">
      <div className="state-editor-header">
        <span>Stack (top first)</span>
        <button
          className="state-editor-add-btn"
          onClick={handleAdd}
          type="button"
        >
          + Add
        </button>
      </div>
      {stack.length === 0 ? (
        <div className="state-editor-empty">Empty stack</div>
      ) : (
        <div className="state-editor-entries">
          {stack.map((entry, index) => (
            <div key={index} className="state-editor-entry">
              <span className="state-editor-index">[{index}]</span>
              <input
                className="state-editor-input value"
                value={
                  typeof entry === "bigint" ? `0x${entry.toString(16)}` : entry
                }
                onChange={(e) => handleEntryChange(index, e.target.value)}
                placeholder="value (hex)"
              />
              <button
                className="state-editor-remove-btn"
                onClick={() => handleRemove(index)}
                type="button"
                aria-label="Remove entry"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Component for editing memory contents.
 */
function MemoryEditor({
  memory,
  onChange,
}: {
  memory: string | undefined;
  onChange: (memory: string) => void;
}): JSX.Element {
  return (
    <div className="state-editor-section">
      <div className="state-editor-header">
        <span>Memory</span>
      </div>
      <textarea
        className="state-editor-textarea"
        value={memory || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0x... (hex bytes)"
        rows={3}
      />
    </div>
  );
}

/**
 * Main visualization component for pointer resolution.
 */
export function ResolutionVisualizer({
  showPointerInput = true,
  showStateEditor = true,
  showFullValues = false,
}: ResolutionVisualizerProps): JSX.Element {
  const {
    pointer,
    stateSpec,
    isResolving,
    result,
    error,
    setPointer,
    updateStateSpec,
    resolve,
  } = usePointerResolverContext();

  const [pointerJson, setPointerJson] = useState<string>(
    pointer ? JSON.stringify(pointer, null, 2) : "",
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const handlePointerChange = useCallback(
    (json: string) => {
      setPointerJson(json);
      setParseError(null);

      if (!json.trim()) {
        setPointer(null);
        return;
      }

      try {
        const parsed = JSON.parse(json) as Pointer;
        setPointer(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Invalid JSON");
      }
    },
    [setPointer],
  );

  return (
    <div className="resolution-visualizer">
      <div className="resolution-visualizer-inputs">
        {showPointerInput && (
          <div className="resolution-visualizer-panel pointer-panel">
            <h4 className="panel-title">Pointer Definition</h4>
            <textarea
              className="pointer-input"
              value={pointerJson}
              onChange={(e) => handlePointerChange(e.target.value)}
              placeholder='{"location": "storage", "slot": 0}'
              rows={10}
            />
            {parseError && (
              <div className="pointer-parse-error">{parseError}</div>
            )}
          </div>
        )}

        {showStateEditor && (
          <div className="resolution-visualizer-panel state-panel">
            <h4 className="panel-title">Machine State</h4>
            <div className="state-editor">
              <StorageEditor
                storage={stateSpec.storage || {}}
                onChange={(storage) => updateStateSpec("storage", storage)}
              />
              <StackEditor
                stack={stateSpec.stack || []}
                onChange={(stack) => updateStateSpec("stack", stack)}
              />
              <MemoryEditor
                memory={stateSpec.memory}
                onChange={(memory) => updateStateSpec("memory", memory)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="resolution-visualizer-controls">
        <button
          className="resolve-button"
          onClick={() => resolve()}
          disabled={isResolving || !pointer}
          type="button"
        >
          {isResolving ? "Resolving..." : "Resolve Pointer"}
        </button>
      </div>

      <div className="resolution-visualizer-output">
        {error && (
          <div className="resolution-error">
            <h4>Resolution Error</h4>
            <pre>{error.message}</pre>
          </div>
        )}

        {result && (
          <>
            <div className="resolution-visualizer-panel regions-panel">
              <h4 className="panel-title">Named Regions</h4>
              <RegionMap regions={result.namedRegions} />
            </div>

            <div className="resolution-visualizer-panel output-panel">
              <h4 className="panel-title">Resolved Output</h4>
              <RegionOutput
                regions={result.regions}
                values={result.values}
                showFullValues={showFullValues}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
