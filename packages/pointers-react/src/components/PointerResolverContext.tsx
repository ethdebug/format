/**
 * React context for pointer resolution state management.
 */

import React, { createContext, useContext } from "react";
import type { Pointer } from "@ethdebug/format";
import {
  usePointerResolution,
  type PointerResolutionState,
  type UsePointerResolutionOptions,
} from "#hooks/usePointerResolution";
import type { MockStateSpec } from "#utils/mockState";

const PointerResolverContext = createContext<
  PointerResolutionState | undefined
>(undefined);

/**
 * Hook to access the PointerResolver context.
 *
 * @returns The current pointer resolution state
 * @throws If used outside of a PointerResolverProvider
 */
export function usePointerResolverContext(): PointerResolutionState {
  const context = useContext(PointerResolverContext);
  if (context === undefined) {
    throw new Error(
      "usePointerResolverContext must be used within a PointerResolverProvider",
    );
  }
  return context;
}

/**
 * Props for PointerResolverProvider.
 */
export interface PointerResolverProviderProps extends UsePointerResolutionOptions {
  children: React.ReactNode;
}

/**
 * Provides pointer resolution context to child components.
 *
 * @param props - Provider configuration and children
 * @returns Context provider wrapping children
 */
export function PointerResolverProvider({
  children,
  ...options
}: PointerResolverProviderProps): JSX.Element {
  const state = usePointerResolution(options);

  return (
    <PointerResolverContext.Provider value={state}>
      {children}
    </PointerResolverContext.Provider>
  );
}

/**
 * Re-export types for convenience.
 */
export type { Pointer, MockStateSpec, PointerResolutionState };
