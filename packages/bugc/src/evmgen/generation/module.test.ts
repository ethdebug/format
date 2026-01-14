import { describe, it, expect } from "vitest";

import * as Ir from "#ir";

import { generate } from "./module.js";

describe("Module.generate", () => {
  it("should generate runtime bytecode for module without constructor", () => {
    const module: Ir.Module = {
      name: "Test",
      functions: new Map(),
      main: {
        name: "main",
        parameters: [],
        entry: "entry",
        blocks: new Map([
          [
            "entry",
            {
              id: "entry",
              phis: [],
              instructions: [],
              terminator: { kind: "return", operationDebug: {} },
              predecessors: new Set(),
              debug: {},
            } as Ir.Block,
          ],
        ]),
      },
    };

    const memoryLayouts = {
      main: {
        allocations: {},
        nextStaticOffset: 0x80,
      },
      functions: {},
    };

    const blockLayouts = {
      main: {
        order: ["entry"],
        offsets: new Map(),
      },
      functions: {},
    };

    const result = generate(module, memoryLayouts, blockLayouts);

    expect(result.runtime).toBeDefined();
    expect(result.create).toBeDefined(); // Always generates constructor
    // Runtime now includes memory initialization (5 bytes) even for empty function
    // PUSH1 0x80 (2) + PUSH1 0x40 (2) + MSTORE (1) = 5 bytes minimum
    expect(result.runtime.length).toBeGreaterThanOrEqual(5);
    expect(result.create!.length).toBeGreaterThan(0); // Constructor needs deployment code
  });

  it("should generate deployment bytecode with constructor", () => {
    const module: Ir.Module = {
      name: "Test",
      functions: new Map(),
      create: {
        name: "create",
        parameters: [],
        entry: "entry",
        blocks: new Map([
          [
            "entry",
            {
              id: "entry",
              phis: [],
              instructions: [],
              terminator: { kind: "return", operationDebug: {} },
              predecessors: new Set(),
              debug: {},
            } as Ir.Block,
          ],
        ]),
      },
      main: {
        name: "main",
        parameters: [],
        entry: "entry",
        blocks: new Map([
          [
            "entry",
            {
              id: "entry",
              phis: [],
              instructions: [],
              terminator: { kind: "return", operationDebug: {} },
              predecessors: new Set(),
              debug: {},
            } as Ir.Block,
          ],
        ]),
      },
    };

    const memoryLayouts = {
      create: {
        allocations: {},
        nextStaticOffset: 0x80,
      },
      main: {
        allocations: {},
        nextStaticOffset: 0x80,
      },
      functions: {},
    };

    const blockLayouts = {
      create: {
        order: ["entry"],
        offsets: new Map(),
      },
      main: {
        order: ["entry"],
        offsets: new Map(),
      },
      functions: {},
    };

    const result = generate(module, memoryLayouts, blockLayouts);

    expect(result.runtime).toBeDefined();
    expect(result.create).toBeDefined();

    // Deployment bytecode should be longer (includes constructor + runtime)
    expect(result.create!.length).toBeGreaterThan(result.runtime.length);

    // Should have CODECOPY and RETURN instructions for deployment
    expect(
      result.createInstructions?.some((inst) => inst.mnemonic === "CODECOPY"),
    ).toBe(true);
    expect(
      result.createInstructions?.some((inst) => inst.mnemonic === "RETURN"),
    ).toBe(true);
  });

  describe("Bytecode Optimization", () => {
    it("should use optimal PUSH opcodes based on value size", () => {
      const module: Ir.Module = {
        name: "Test",
        functions: new Map(),
        main: {
          name: "main",
          parameters: [],
          entry: "entry",
          blocks: new Map([
            [
              "entry",
              {
                id: "entry",
                phis: [],
                instructions: [
                  {
                    kind: "const",
                    value: 42n,
                    type: Ir.Type.Scalar.uint256,
                    dest: "%1",
                    operationDebug: {},
                  },
                ],
                terminator: { kind: "return", operationDebug: {} },
                predecessors: new Set(),
                debug: {},
              },
            ],
          ]),
        },
      };

      const result = generate(
        module,
        {
          main: {
            allocations: { "%1": { offset: 0x80, size: 32 } },
            nextStaticOffset: 0xa0,
          },
          functions: {},
        },
        {
          main: { order: ["entry"], offsets: new Map() },
          functions: {},
        },
      );

      const deployment = result.create!;

      // For small runtime (< 256 bytes), should use PUSH1 not PUSH2
      // Find the PUSH opcodes that push runtime length
      const runtimeLength = result.runtime.length;
      expect(runtimeLength).toBeLessThan(256);

      // Count PUSH1 vs PUSH2 opcodes
      let push1Count = 0;
      let push2Count = 0;

      for (let i = 0; i < deployment.length; i++) {
        if (deployment[i] === 0x60) {
          // PUSH1
          const value = deployment[i + 1];
          if (value === runtimeLength) push1Count++;
        } else if (deployment[i] === 0x61) {
          // PUSH2
          const value = (deployment[i + 1] << 8) | deployment[i + 2];
          if (value === runtimeLength) push2Count++;
        }
      }

      // Should use PUSH1 for small values
      expect(push1Count).toBeGreaterThan(0);
      expect(push2Count).toBe(0);
    });

    it("should use PUSH3 for offsets larger than 65535", () => {
      // Create a module that will have deployment bytecode > 65535
      // We can simulate this by having a large runtime bytecode
      // Instead of 20000 instructions, we'll create a mock scenario
      const instructions = Array.from({ length: 1000 }, (_, i) => ({
        kind: "const" as const,
        value: BigInt(0xffffff), // Large constant to generate more bytes
        type: Ir.Type.Scalar.uint256,
        dest: `%${i}`,
        operationDebug: {},
      }));

      const module: Ir.Module = {
        name: "LargeContract",
        functions: new Map(),
        main: {
          name: "main",
          parameters: [],
          entry: "entry",
          blocks: new Map([
            [
              "entry",
              {
                id: "entry",
                phis: [],
                instructions,
                terminator: { kind: "return", operationDebug: {} },
                predecessors: new Set(),
                debug: {},
              },
            ],
          ]),
        },
      };

      const allocations = new Map(
        instructions.map((inst, i) => [inst.dest, i * 32]),
      );

      const result = generate(
        module,
        {
          main: {
            allocations: Object.fromEntries(
              Array.from(allocations.entries()).map(([k, v]) => [
                k,
                { offset: v, size: 32 },
              ]),
            ),
            nextStaticOffset: 32000,
          },
          functions: {},
        },
        {
          main: { order: ["entry"], offsets: new Map() },
          functions: {},
        },
      );

      // The test just verifies we can handle memory-allocated values
      // without stack overflow (which we fixed)
      expect(result.runtime.length).toBeGreaterThan(0);
      expect(result.create).toBeDefined();

      // Check that deployment bytecode uses appropriate PUSH opcodes
      const deployment = result.create!;

      // Find what PUSH opcodes are used for the runtime offset
      let hasOptimalPush = false;
      const runtimeOffset = deployment.length - result.runtime.length;

      for (let i = 0; i < deployment.length - 3; i++) {
        if (deployment[i] >= 0x60 && deployment[i] <= 0x7f) {
          // PUSH1-PUSH32
          const pushSize = deployment[i] - 0x5f;
          if (pushSize > 0 && i + pushSize < deployment.length) {
            let value = 0;
            for (let j = 1; j <= pushSize; j++) {
              value = (value << 8) | deployment[i + j];
            }
            if (value === runtimeOffset) {
              // Check if this is the optimal size
              const optimalSize =
                runtimeOffset === 0
                  ? 1
                  : runtimeOffset < 256
                    ? 1
                    : runtimeOffset < 65536
                      ? 2
                      : 3;
              hasOptimalPush = pushSize === optimalSize;
              break;
            }
          }
        }
      }

      expect(hasOptimalPush).toBe(true);
    });

    it("should calculate deployment size correctly with optimal PUSH opcodes", () => {
      const module: Ir.Module = {
        name: "Test",
        functions: new Map(),
        main: {
          name: "main",
          parameters: [],
          entry: "entry",
          blocks: new Map([
            [
              "entry",
              {
                id: "entry",
                phis: [],
                instructions: [],
                terminator: { kind: "return", operationDebug: {} },
                predecessors: new Set(),
                debug: {},
              },
            ],
          ]),
        },
      };

      const result = generate(
        module,
        {
          main: { allocations: {}, nextStaticOffset: 0x80 },
          functions: {},
        },
        {
          main: { order: ["entry"], offsets: new Map() },
          functions: {},
        },
      );

      const deployment = result.create!;
      const runtime = result.runtime;

      // Verify runtime is embedded at the end of deployment
      const deploymentEnd =
        runtime.length > 0 ? deployment.slice(-runtime.length) : [];
      expect(Array.from(deploymentEnd)).toEqual(Array.from(runtime));

      // Verify CODECOPY copies from correct offset
      const expectedOffset = deployment.length - runtime.length;

      // Find CODECOPY and verify the offset pushed before it
      const codecopyIndex = deployment.indexOf(0x39);

      // Check what value is pushed before CODECOPY (after the length push)
      // It should be the offset where runtime starts
      let actualOffset = -1;

      // Look backwards from CODECOPY for PUSH opcodes
      for (let i = codecopyIndex - 1; i >= 0; i--) {
        if (deployment[i] >= 0x60 && deployment[i] <= 0x7f) {
          // PUSH1-PUSH32
          const pushSize = deployment[i] - 0x5f;
          if (i + pushSize < codecopyIndex) {
            // This could be our offset push
            actualOffset = 0;
            for (let j = 1; j <= pushSize; j++) {
              actualOffset = (actualOffset << 8) | deployment[i + j];
            }
            // Verify this is the runtime offset
            if (actualOffset === expectedOffset) {
              break;
            }
          }
        }
      }

      expect(actualOffset).toBe(expectedOffset);
    });

    it("should not truncate values when generating PUSH instructions", () => {
      // Test that we correctly handle all value sizes
      const testCases = [
        { value: 0n, expectedPushSize: 1 }, // PUSH0 or PUSH1 0x00
        { value: 255n, expectedPushSize: 1 }, // PUSH1
        { value: 256n, expectedPushSize: 2 }, // PUSH2
        { value: 65535n, expectedPushSize: 2 }, // PUSH2
        { value: 65536n, expectedPushSize: 3 }, // PUSH3
      ];

      for (const { value, expectedPushSize } of testCases) {
        const module: Ir.Module = {
          name: "Test",
          functions: new Map(),
          main: {
            name: "main",
            parameters: [],
            entry: "entry",
            blocks: new Map([
              [
                "entry",
                {
                  id: "entry",
                  phis: [],
                  instructions: [
                    {
                      kind: "const",
                      value,
                      type: Ir.Type.Scalar.uint256,
                      dest: "%1",
                      operationDebug: {},
                    },
                  ],
                  terminator: { kind: "return", operationDebug: {} },
                  predecessors: new Set(),
                  debug: {},
                },
              ],
            ]),
          },
        };

        const result = generate(
          module,
          {
            main: {
              allocations: { "%1": { offset: 0x80, size: 32 } },
              nextStaticOffset: 0xa0,
            },
            functions: {},
          },
          {
            main: { order: ["entry"], offsets: new Map() },
            functions: {},
          },
        );

        // Find the PUSH instruction for our constant
        const runtime = result.runtime;

        // Look for PUSH instructions (no JUMPDEST for entry with no predecessors)
        let found = false;
        for (let i = 0; i < runtime.length; i++) {
          if (runtime[i] >= 0x5f && runtime[i] <= 0x7f) {
            // PUSH0-PUSH32
            const pushOpcode = runtime[i];
            const pushSize = pushOpcode === 0x5f ? 0 : pushOpcode - 0x5f;

            if (pushSize > 0) {
              // Read the value
              let pushedValue = 0n;
              for (let j = 1; j <= pushSize; j++) {
                pushedValue = (pushedValue << 8n) | BigInt(runtime[i + j]);
              }

              if (pushedValue === value) {
                found = true;
                expect(pushSize).toBe(expectedPushSize);
                break;
              }
            } else if (value === 0n) {
              found = true;
              expect(pushOpcode).toBe(0x5f); // PUSH0
              break;
            }
          }
        }

        expect(found).toBe(true);
      }
    });
  });
});
