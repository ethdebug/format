import { useState, useCallback } from "react";
import { compile } from "./compile";
import type { CompileResult } from "./types";

export function useCompiler() {
  const [compileResult, setCompileResult] = useState<CompileResult | null>(
    null,
  );
  const [isCompiling, setIsCompiling] = useState(false);

  const doCompile = useCallback(
    async (code: string, optimizationLevel: number) => {
      setIsCompiling(true);
      try {
        const result = await compile(code, optimizationLevel);
        setCompileResult(result);
      } catch (error) {
        setCompileResult({
          success: false,
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      } finally {
        setIsCompiling(false);
      }
    },
    [],
  );

  return {
    compileResult,
    isCompiling,
    compile: doCompile,
  };
}
