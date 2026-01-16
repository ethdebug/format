/**
 * AstView component for displaying the AST of a BUG program.
 */

import React from "react";
import type { Ast } from "@ethdebug/bugc";
import "./AstView.css";

/**
 * Props for AstView component.
 */
export interface AstViewProps {
  /** The AST to display */
  ast: Ast.Program;
}

/**
 * Displays a BUG program's Abstract Syntax Tree as formatted JSON.
 *
 * Automatically excludes parent references to avoid circular structures.
 *
 * @param props - AST to display
 * @returns AstView element
 *
 * @example
 * ```tsx
 * <AstView ast={compileResult.ast} />
 * ```
 */
export function AstView({ ast }: AstViewProps): JSX.Element {
  // Format AST as JSON, excluding parent references to avoid circular structure
  const astJson = JSON.stringify(
    ast,
    (key, value) => {
      if (key === "parent") return undefined;
      return value;
    },
    2,
  );

  return (
    <div className="ast-view">
      <pre className="ast-json">{astJson}</pre>
    </div>
  );
}
