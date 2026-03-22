import { describe, it, expect } from "vitest";

import { compile } from "#compiler";

import * as Ir from "#ir/spec";

import { Statistics } from "./stats.js";

describe("Statistics", () => {
  const compileToIr = async (source: string): Promise<Ir.Module> => {
    const result = await compile({ to: "ir", source, sourcePath: "test.bug" });

    if (!result.success) {
      throw new Error("Compilation failed");
    }

    return result.value.ir;
  };

  describe("computeDominatorTree", () => {
    it("should compute correct dominators for simple if-else", async () => {
      const source = `
        name Test;
        storage { [0] x: uint256; }
        code {
          if (x > 0) {
            x = 1;
          } else {
            x = 2;
          }
          return;
        }
      `;

      const ir = await compileToIr(source);
      const stats = new Statistics.Analyzer();
      const analysis = stats.analyze(ir);

      // Check dominator relationships
      const dom = analysis.dominatorTree;

      // Entry dominates all blocks
      expect(dom.entry).toBe(null); // Entry has no dominator

      // The then and else blocks should be dominated by entry
      const thenBlock = Object.keys(dom).find((b) => b.includes("then"));
      const elseBlock = Object.keys(dom).find((b) => b.includes("else"));
      const mergeBlock = Object.keys(dom).find((b) => b.includes("merge"));

      expect(thenBlock).toBeDefined();
      expect(elseBlock).toBeDefined();
      expect(mergeBlock).toBeDefined();

      expect(dom[thenBlock!]).toBe("entry");
      expect(dom[elseBlock!]).toBe("entry");
      expect(dom[mergeBlock!]).toBe("entry");
    });

    it("should compute correct dominators for nested control flow", async () => {
      const source = `
        name Test;
        storage { [0] x: uint256; }
        code {
          if (x > 0) {
            if (x < 10) {
              x = 1;
            }
            x = x + 1;
          }
          return;
        }
      `;

      const ir = await compileToIr(source);
      const stats = new Statistics.Analyzer();
      const analysis = stats.analyze(ir);

      const dom = analysis.dominatorTree;

      // Find the nested blocks
      const blocks = Object.keys(dom);
      const outerThen = blocks.find((b) => b === "then_1");
      const innerThen = blocks.find((b) => b === "then_3");
      const innerMerge = blocks.find((b) => b === "merge_4");

      expect(outerThen).toBeDefined();
      expect(innerThen).toBeDefined();
      expect(innerMerge).toBeDefined();

      // Outer then is dominated by entry
      expect(dom[outerThen!]).toBe("entry");

      // Inner blocks are dominated by outer then
      expect(dom[innerThen!]).toBe(outerThen);
      expect(dom[innerMerge!]).toBe(outerThen);
    });

    it("should detect loops correctly with proper dominators", async () => {
      const source = `
        name Test;
        storage { [0] x: uint256; }
        code {
          for (let i = 0; i < 10; i = i + 1) {
            x = x + i;
          }
          return;
        }
      `;

      const ir = await compileToIr(source);
      const stats = new Statistics.Analyzer();
      const analysis = stats.analyze(ir);

      // Check that loops are detected
      expect(analysis.loopInfo).toHaveLength(1);

      const loop = analysis.loopInfo[0];
      expect(loop.header).toContain("for_header");
      expect(loop.blocks.length).toBeGreaterThan(2); // header, body, update at minimum

      // Verify dominator relationships in loop
      const dom = analysis.dominatorTree;
      const header = loop.header;
      const body = Object.keys(dom).find((b) => b.includes("for_body"));
      const update = Object.keys(dom).find((b) => b.includes("for_update"));

      expect(body).toBeDefined();
      expect(update).toBeDefined();

      // Header dominates body and update
      expect(dom[body!]).toBe(header);
      expect(dom[update!]).toBe(body); // Body dominates update in for loops
    });

    it("should handle complex control flow with multiple merge points", async () => {
      const source = `
        name Test;
        storage { [0] x: uint256; [1] y: uint256; }
        code {
          if (x > 0) {
            if (y > 0) {
              x = 1;
            } else {
              x = 2;
            }
          } else {
            if (y < 0) {
              x = 3;
            } else {
              x = 4;
            }
          }
          return;
        }
      `;

      const ir = await compileToIr(source);
      const stats = new Statistics.Analyzer();
      const analysis = stats.analyze(ir);

      const dom = analysis.dominatorTree;

      // All blocks should have proper dominators
      for (const [block, dominator] of Object.entries(dom)) {
        if (block !== "entry") {
          expect(dominator).toBeDefined();
          expect(typeof dominator).toBe("string");
        }
      }

      // No loops should be detected in this example
      expect(analysis.loopInfo).toHaveLength(0);
    });
  });

  describe("detectLoops", () => {
    it("should detect nested loops", async () => {
      const source = `
        name Test;
        storage { [0] x: uint256; }
        code {
          for (let i = 0; i < 10; i = i + 1) {
            for (let j = 0; j < 5; j = j + 1) {
              x = x + i + j;
            }
          }
          return;
        }
      `;

      const ir = await compileToIr(source);
      const stats = new Statistics.Analyzer();
      const analysis = stats.analyze(ir);

      // Should detect both loops
      expect(analysis.loopInfo.length).toBeGreaterThanOrEqual(2);

      // Find the loops by their headers
      const outerLoop = analysis.loopInfo.find(
        (l) => l.header === "for_header_1",
      );
      const innerLoop = analysis.loopInfo.find(
        (l) => l.header === "for_header_5",
      );

      expect(outerLoop).toBeDefined();
      expect(innerLoop).toBeDefined();

      // Verify loop blocks
      expect(outerLoop!.blocks.length).toBeGreaterThan(3);
      expect(innerLoop!.blocks.length).toBeGreaterThan(2);

      // Verify loop depths
      expect(outerLoop!.depth).toBe(1); // Outer loop has depth 1
      expect(innerLoop!.depth).toBe(2); // Inner loop has depth 2
    });

    it("should detect deeply nested loops with correct depths", async () => {
      const source = `
        name Test;
        storage { [0] x: uint256; }
        code {
          for (let i = 0; i < 10; i = i + 1) {
            for (let j = 0; j < 5; j = j + 1) {
              for (let k = 0; k < 3; k = k + 1) {
                x = x + i + j + k;
              }
            }
          }
          return;
        }
      `;

      const ir = await compileToIr(source);
      const stats = new Statistics.Analyzer();
      const analysis = stats.analyze(ir);

      // Should detect all three loops
      expect(analysis.loopInfo.length).toBeGreaterThanOrEqual(3);

      // Sort loops by depth to make testing easier
      const loopsByDepth = analysis.loopInfo.sort((a, b) => a.depth - b.depth);

      // Check depths
      expect(loopsByDepth[0].depth).toBe(1); // Outermost loop
      expect(loopsByDepth[1].depth).toBe(2); // Middle loop
      expect(loopsByDepth[2].depth).toBe(3); // Innermost loop
    });
  });
});
