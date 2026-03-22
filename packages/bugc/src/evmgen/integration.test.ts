import { describe, it, expect } from "vitest";
import { bytecodeSequence, buildSequence } from "#compiler";

describe("EVM Generation Integration", () => {
  it("should compile minimal.bug to bytecode", async () => {
    const source = `name Minimal;

storage {
  [0] value: uint256;
}

code {
  value = 1;
}`;

    const compiler = buildSequence(bytecodeSequence);
    const result = await compiler.run({ source });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.bytecode).toBeDefined();
      expect(result.value.bytecode.runtime).toBeInstanceOf(Uint8Array);
      expect(result.value.bytecode.runtime.length).toBeGreaterThan(0);

      // Should have constructor bytecode (even if no create block)
      expect(result.value.bytecode.create).toBeInstanceOf(Uint8Array);
      expect(result.value.bytecode.create!.length).toBeGreaterThan(
        result.value.bytecode.runtime.length,
      );
    }
  });

  it("should compile counter with arithmetic", async () => {
    const source = `name Counter;

storage {
  [0] count: uint256;
}

code {
  count = count + 1;
}`;

    const compiler = buildSequence(bytecodeSequence);
    const result = await compiler.run({ source });

    expect(result.success).toBe(true);
    if (result.success) {
      const { runtime } = result.value.bytecode;

      // Check for expected opcodes
      const bytecode = Array.from(runtime);

      // Should contain SLOAD (0x54)
      expect(bytecode).toContain(0x54);

      // Should contain ADD (0x01)
      expect(bytecode).toContain(0x01);

      // Should contain SSTORE (0x55)
      expect(bytecode).toContain(0x55);
    }
  });

  it("should compile with constructor", async () => {
    const source = `name WithConstructor;

storage {
  [0] owner: address;
}

create {
  owner = msg.sender;
}

code {
  if (msg.sender == owner) {
    owner = 0x0000000000000000000000000000000000000000;
  }
}`;

    const compiler = buildSequence(bytecodeSequence);
    const result = await compiler.run({ source });

    expect(result.success).toBe(true);
    if (result.success) {
      const { runtime, create } = result.value.bytecode;

      expect(runtime).toBeInstanceOf(Uint8Array);
      expect(create).toBeInstanceOf(Uint8Array);

      // Constructor should be larger (includes runtime + deployment logic)
      expect(create!.length).toBeGreaterThan(runtime.length);

      // Should have CODECOPY in constructor
      const createBytes = Array.from(create!);
      expect(createBytes).toContain(0x39); // CODECOPY
      expect(createBytes).toContain(0xf3); // RETURN
    }
  });
});
