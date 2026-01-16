/**
 * Hook for pointer resolution with state management.
 */

import { useState, useCallback, useEffect } from "react";
import type { Pointer } from "@ethdebug/format";
import { dereference, type Cursor, Data } from "@ethdebug/pointers";
import { createMockState, type MockStateSpec } from "#utils/mockState";

/**
 * Result of resolving a pointer against machine state.
 */
export interface ResolutionResult {
  /** The resolved regions */
  regions: Cursor.Region[];
  /** Values read from each region */
  values: Map<Cursor.Region, Data>;
  /** Named region lookup */
  namedRegions: Record<string, Cursor.Region[]>;
  /** Most recent region for each name */
  lookup: Record<string, Cursor.Region>;
}

/**
 * State returned by usePointerResolution hook.
 */
export interface PointerResolutionState {
  /** The current pointer being resolved */
  pointer: Pointer | null;
  /** The current machine state specification */
  stateSpec: MockStateSpec;
  /** Whether resolution is in progress */
  isResolving: boolean;
  /** The resolution result, if available */
  result: ResolutionResult | null;
  /** Any error that occurred during resolution */
  error: Error | null;

  /** Set a new pointer to resolve */
  setPointer(pointer: Pointer | null): void;
  /** Update the machine state specification */
  setStateSpec(spec: MockStateSpec): void;
  /** Update a single field of the state specification */
  updateStateSpec<K extends keyof MockStateSpec>(
    key: K,
    value: MockStateSpec[K],
  ): void;
  /** Trigger resolution (usually called automatically) */
  resolve(): Promise<void>;
  /** Reset to initial state */
  reset(): void;
}

/**
 * Options for usePointerResolution hook.
 */
export interface UsePointerResolutionOptions {
  /** Initial pointer to resolve */
  initialPointer?: Pointer;
  /** Initial machine state specification */
  initialStateSpec?: MockStateSpec;
  /** Whether to auto-resolve when pointer or state changes */
  autoResolve?: boolean;
}

/**
 * Hook for managing pointer resolution state.
 *
 * @param options - Configuration options
 * @returns Pointer resolution state and controls
 */
export function usePointerResolution(
  options: UsePointerResolutionOptions = {},
): PointerResolutionState {
  const {
    initialPointer = null,
    initialStateSpec = {},
    autoResolve = true,
  } = options;

  const [pointer, setPointer] = useState<Pointer | null>(initialPointer);
  const [stateSpec, setStateSpec] = useState<MockStateSpec>(initialStateSpec);
  const [isResolving, setIsResolving] = useState(false);
  const [result, setResult] = useState<ResolutionResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const updateStateSpec = useCallback(
    <K extends keyof MockStateSpec>(key: K, value: MockStateSpec[K]) => {
      setStateSpec((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resolve = useCallback(async () => {
    if (!pointer) {
      setResult(null);
      setError(null);
      return;
    }

    setIsResolving(true);
    setError(null);

    try {
      const state = createMockState(stateSpec);
      const cursor = await dereference(pointer, { state });
      const view = await cursor.view(state);

      // Read values for each region
      const values = new Map<Cursor.Region, Data>();
      for (const region of view.regions) {
        try {
          const data = await view.read(region);
          values.set(region, data);
        } catch {
          // Some regions may not be readable, skip them
        }
      }

      // Build named regions map
      const namedRegions: Record<string, Cursor.Region[]> = {};
      for (const region of view.regions) {
        if ("name" in region && typeof region.name === "string") {
          if (!namedRegions[region.name]) {
            namedRegions[region.name] = [];
          }
          namedRegions[region.name].push(region);
        }
      }

      // Build lookup (most recent by name)
      const lookup: Record<string, Cursor.Region> = {};
      for (const [name, regions] of Object.entries(namedRegions)) {
        if (regions.length > 0) {
          lookup[name] = regions[regions.length - 1];
        }
      }

      setResult({
        regions: [...view.regions],
        values,
        namedRegions,
        lookup,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setResult(null);
    } finally {
      setIsResolving(false);
    }
  }, [pointer, stateSpec]);

  const reset = useCallback(() => {
    setPointer(initialPointer);
    setStateSpec(initialStateSpec);
    setResult(null);
    setError(null);
  }, [initialPointer, initialStateSpec]);

  // Auto-resolve when pointer or state changes
  useEffect(() => {
    if (autoResolve) {
      resolve();
    }
  }, [autoResolve, resolve]);

  return {
    pointer,
    stateSpec,
    isResolving,
    result,
    error,
    setPointer,
    setStateSpec,
    updateStateSpec,
    resolve,
    reset,
  };
}
