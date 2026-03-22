/**
 * @ethdebug/pointers-react
 *
 * React components for visualizing ethdebug/format pointer resolution.
 */

// Context and Provider
export {
  PointerResolverProvider,
  usePointerResolverContext,
  type PointerResolverProviderProps,
  type PointerResolutionState,
} from "#components/PointerResolverContext";

// Main visualization component
export {
  ResolutionVisualizer,
  type ResolutionVisualizerProps,
} from "#components/ResolutionVisualizer";

// Sub-components
export { RegionMap, type RegionMapProps } from "#components/RegionMap";

export { RegionOutput, type RegionOutputProps } from "#components/RegionOutput";

// Hooks
export {
  usePointerResolution,
  type UsePointerResolutionOptions,
  type ResolutionResult,
} from "#hooks/usePointerResolution";

// Utilities
export {
  createMockState,
  formatData,
  formatDataShort,
  type MockStateSpec,
} from "#utils/mockState";

// Re-export types from dependencies for convenience
export type { Pointer } from "@ethdebug/format";
export type { Cursor, Machine, Data } from "@ethdebug/pointers";

// CSS - consumers should import these stylesheets
// import "@ethdebug/pointers-react/components/variables.css";
// import "@ethdebug/pointers-react/components/ResolutionVisualizer.css";
// import "@ethdebug/pointers-react/components/RegionMap.css";
// import "@ethdebug/pointers-react/components/RegionOutput.css";
