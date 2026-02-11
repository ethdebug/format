/**
 * Context for coordinating between pointer examples and the drawer widget.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Pointer } from "@ethdebug/format";
import type { MockStateSpec } from "@ethdebug/pointers-react";

export interface PointerPlaygroundState {
  /** Current pointer in the playground */
  pointer: Pointer | null;
  /** Current machine state */
  stateSpec: MockStateSpec;
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Load a pointer example into the playground */
  loadExample(pointer: Pointer, state?: MockStateSpec): void;
  /** Open the drawer */
  openDrawer(): void;
  /** Close the drawer */
  closeDrawer(): void;
  /** Toggle the drawer */
  toggleDrawer(): void;
  /** Update the pointer */
  setPointer(pointer: Pointer | null): void;
  /** Update the state */
  setStateSpec(state: MockStateSpec): void;
}

const PointerPlaygroundContext = createContext<PointerPlaygroundState | null>(
  null,
);

export interface PointerPlaygroundProviderProps {
  children: ReactNode;
  /** Initial pointer */
  initialPointer?: Pointer | null;
  /** Initial state */
  initialState?: MockStateSpec;
  /** Whether drawer starts open */
  initialOpen?: boolean;
}

export function PointerPlaygroundProvider({
  children,
  initialPointer = null,
  initialState = {},
  initialOpen = false,
}: PointerPlaygroundProviderProps): JSX.Element {
  const [pointer, setPointer] = useState<Pointer | null>(initialPointer);
  const [stateSpec, setStateSpec] = useState<MockStateSpec>(initialState);
  const [isOpen, setIsOpen] = useState(initialOpen);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  const loadExample = useCallback(
    (newPointer: Pointer, newState: MockStateSpec = {}) => {
      setPointer(newPointer);
      setStateSpec(newState);
      setIsOpen(true);
    },
    [],
  );

  return (
    <PointerPlaygroundContext.Provider
      value={{
        pointer,
        stateSpec,
        isOpen,
        loadExample,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        setPointer,
        setStateSpec,
      }}
    >
      {children}
    </PointerPlaygroundContext.Provider>
  );
}

export function usePointerPlayground(): PointerPlaygroundState {
  const context = useContext(PointerPlaygroundContext);
  if (!context) {
    throw new Error(
      "usePointerPlayground must be used within a PointerPlaygroundProvider",
    );
  }
  return context;
}

/**
 * Hook that returns null if not in a playground context.
 * Useful for components that can work both inside and outside the playground.
 */
export function usePointerPlaygroundOptional(): PointerPlaygroundState | null {
  return useContext(PointerPlaygroundContext);
}
