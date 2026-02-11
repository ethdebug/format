/**
 * Tests for ProgramExampleContext.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import {
  ProgramExampleContextProvider,
  useProgramExampleContext,
} from "./ProgramExampleContext.js";

describe("ProgramExampleContext", () => {
  const source = {
    id: "test-source",
    path: "/test/source.js",
    language: "javascript",
    contents: "let x = 1;",
  };

  const instructions = [
    {
      operation: { mnemonic: "PUSH1" as const, arguments: ["0x01"] },
      context: { remark: "push value" },
    },
    {
      operation: { mnemonic: "STOP" as const },
      context: { remark: "stop" },
    },
  ];

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ProgramExampleContextProvider
      sources={[source]}
      instructions={instructions}
    >
      {children}
    </ProgramExampleContextProvider>
  );

  it("provides sources from props", () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    expect(result.current.sources).toHaveLength(1);
    expect(result.current.sources[0].id).toBe("test-source");
  });

  it("computes instruction offsets", () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    expect(result.current.instructions).toHaveLength(2);
    expect(result.current.instructions[0].offset).toBe(0);
    expect(result.current.instructions[1].offset).toBe(2); // After PUSH1 0x01
  });

  it("starts with no highlighted instruction", () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    expect(result.current.highlightedInstruction).toBeUndefined();
  });

  it("highlights instruction by offset", async () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    act(() => {
      result.current.highlightInstruction(0);
    });

    // Wait for useEffect
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.highlightedInstruction).toBeDefined();
    expect(result.current.highlightedInstruction?.offset).toBe(0);
    expect(result.current.highlightedInstruction?.context).toEqual({
      remark: "push value",
    });
  });

  it("clears highlight when offset is undefined", async () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    // First highlight an instruction
    act(() => {
      result.current.highlightInstruction(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.highlightedInstruction).toBeDefined();

    // Then clear it
    act(() => {
      result.current.highlightInstruction(undefined);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.highlightedInstruction).toBeUndefined();
  });

  it("starts in simple highlight mode", () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    expect(result.current.highlightMode).toBe("simple");
  });

  it("switches to detailed mode", () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    act(() => {
      result.current.showDetails();
    });

    expect(result.current.highlightMode).toBe("detailed");
  });

  it("switches back to simple mode", () => {
    const { result } = renderHook(() => useProgramExampleContext(), {
      wrapper,
    });

    act(() => {
      result.current.showDetails();
    });
    expect(result.current.highlightMode).toBe("detailed");

    act(() => {
      result.current.hideDetails();
    });
    expect(result.current.highlightMode).toBe("simple");
  });

  it("throws when used outside provider", () => {
    // Suppress React's console.error for expected error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useProgramExampleContext());
    }).toThrow(/must be used within a ProgramExampleContextProvider/);

    consoleSpy.mockRestore();
  });
});
