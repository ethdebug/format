/**
 * Context for coordinating between trace examples and the drawer.
 *
 * Unlike mock trace data, this shares BUG source code that gets
 * compiled and executed in the drawer.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface TraceExampleData {
  /** BUG source code to compile and trace */
  source: string;
  /** Optional title for display */
  title?: string;
  /** Optional description */
  description?: string;
}

export interface TracePlaygroundState {
  /** Current example data */
  example: TraceExampleData | null;
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Load an example into the playground */
  loadExample(data: TraceExampleData): void;
  /** Update the source code */
  setSource(source: string): void;
  /** Open the drawer */
  openDrawer(): void;
  /** Close the drawer */
  closeDrawer(): void;
  /** Toggle the drawer */
  toggleDrawer(): void;
}

const TracePlaygroundContext = createContext<TracePlaygroundState | null>(null);

export interface TracePlaygroundProviderProps {
  children: ReactNode;
  /** Initial example */
  initialExample?: TraceExampleData | null;
  /** Whether drawer starts open */
  initialOpen?: boolean;
}

export function TracePlaygroundProvider({
  children,
  initialExample = null,
  initialOpen = false,
}: TracePlaygroundProviderProps): JSX.Element {
  const [example, setExample] = useState<TraceExampleData | null>(
    initialExample,
  );
  const [isOpen, setIsOpen] = useState(initialOpen);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  const loadExample = useCallback((data: TraceExampleData) => {
    setExample(data);
    setIsOpen(true);
  }, []);

  const setSource = useCallback((source: string) => {
    setExample((prev) => (prev ? { ...prev, source } : { source }));
  }, []);

  return (
    <TracePlaygroundContext.Provider
      value={{
        example,
        isOpen,
        loadExample,
        setSource,
        openDrawer,
        closeDrawer,
        toggleDrawer,
      }}
    >
      {children}
    </TracePlaygroundContext.Provider>
  );
}

export function useTracePlayground(): TracePlaygroundState {
  const context = useContext(TracePlaygroundContext);
  if (!context) {
    throw new Error(
      "useTracePlayground must be used within a TracePlaygroundProvider",
    );
  }
  return context;
}

/**
 * Hook that returns null if not in a playground context.
 * Useful for components that can work both inside and outside the playground.
 */
export function useTracePlaygroundOptional(): TracePlaygroundState | null {
  return useContext(TracePlaygroundContext);
}
