/**
 * Storage slot computation analysis for ethdebug/format integration
 *
 * Analyzes IR instruction chains to reconstruct storage slot computations
 * and generate accurate pointer expressions.
 *
 * SAFETY: This module uses defensive programming patterns throughout:
 * - Returns null on any uncertainty rather than guessing
 * - Validates all lookups before use
 * - Handles incomplete/unexpected IR patterns gracefully
 * - Never crashes - just skips what we can't analyze
 */

import * as Ir from "#ir";
import * as Ast from "#ast";
import type * as Format from "@ethdebug/format";

/**
 * A compute_slot instruction in a chain, with its position and semantics
 */
export interface ComputeSlotStep {
  /** The instruction itself */
  instruction: Ir.Instruction.ComputeSlot;

  /** The temp this instruction produces */
  destTemp: string;

  /** For mapping access: the key being hashed */
  key?: Ir.Value;

  /** For struct field: the slot offset */
  fieldSlotOffset?: number;
}

/**
 * A complete chain of compute_slot operations
 */
export interface ComputeSlotChain {
  /** The base slot number (if we can determine it) */
  baseSlot: number | null;

  /** The base storage variable name (if found) */
  baseVariableName: string | null;

  /** The sequence of compute_slot steps */
  steps: ComputeSlotStep[];
}

/**
 * Find the compute_slot instruction chain that produces a given temp
 *
 * Walks backward through the block's instructions to trace how a temp
 * was computed from storage slot operations.
 *
 * SAFETY: Only traces within the current block. Returns null if:
 * - The temp doesn't exist
 * - The temp wasn't produced by compute_slot
 * - The chain spans multiple blocks (not yet supported)
 * - Any step in the chain is ambiguous
 *
 * @param block The block to search in
 * @param slotTemp The temp ID to trace back from
 * @returns The complete chain, or null if we can't analyze it
 */
export function findComputeSlotChain(
  block: Ir.Block,
  slotTemp: string,
): ComputeSlotChain | null {
  const steps: ComputeSlotStep[] = [];
  let currentTemp = slotTemp;
  let baseSlot: number | null = null;

  // Walk backward through the chain
  // Safety: limit iterations to prevent infinite loops
  const MAX_CHAIN_DEPTH = 10;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
    // Find the instruction that produces currentTemp
    const inst = block.instructions.find(
      (i) => "dest" in i && i.dest === currentTemp,
    );

    if (!inst) {
      // Temp not found in this block
      // Could be from a predecessor block or phi node
      // For now, we only handle single-block chains
      return null;
    }

    // Check if it's a compute_slot instruction
    if (inst.kind !== "compute_slot") {
      // The temp comes from some other operation
      // This is the end of the chain
      break;
    }

    // TypeScript narrowing - we know it's ComputeSlot now
    const computeSlotInst = inst as Ir.Instruction.ComputeSlot;

    // Extract step information based on slotKind
    const step: ComputeSlotStep = {
      instruction: computeSlotInst,
      destTemp: computeSlotInst.dest,
    };

    if (Ir.Instruction.ComputeSlot.isMapping(computeSlotInst)) {
      step.key = computeSlotInst.key;
    } else if (Ir.Instruction.ComputeSlot.isField(computeSlotInst)) {
      // Convert byte offset to slot offset
      step.fieldSlotOffset = Math.floor(computeSlotInst.fieldOffset / 32);
    }
    // Array kind has no additional data needed

    steps.push(step);

    // Continue tracing from the base
    if (computeSlotInst.base.kind === "const") {
      // Found the base slot!
      baseSlot = Number(computeSlotInst.base.value);
      break;
    } else if (computeSlotInst.base.kind === "temp") {
      // Continue following the chain
      currentTemp = computeSlotInst.base.id;
    } else {
      // Unexpected base value kind
      return null;
    }
  }

  // Reverse steps to get forward order (base -> ... -> final)
  steps.reverse();

  return {
    baseSlot,
    baseVariableName: null, // Will be filled in by caller
    steps,
  };
}

/**
 * Find the base storage variable for a compute_slot chain
 *
 * Matches the base slot number against storage declarations to find
 * the variable name.
 *
 * SAFETY: Returns null if base slot is unknown or not found in declarations
 *
 * @param chain The compute_slot chain
 * @param storageDecls Storage variable declarations
 * @returns Storage info or null
 */
export function findBaseStorageVariable(
  chain: ComputeSlotChain,
  storageDecls: Ast.Declaration.Storage[],
): { slot: number; name: string; declaration: Ast.Declaration.Storage } | null {
  if (chain.baseSlot === null) {
    return null;
  }

  const decl = storageDecls.find((d) => d.slot === chain.baseSlot);
  if (!decl) {
    return null;
  }

  return {
    slot: chain.baseSlot,
    name: decl.name,
    declaration: decl,
  };
}

/**
 * Information about a storage access we've successfully analyzed
 */
export interface StorageAccessInfo {
  /** The base storage variable name */
  variableName: string;

  /** The storage variable declaration */
  declaration: Ast.Declaration.Storage;

  /** The pointer expression (simple or computed) */
  pointer: Format.Pointer;

  /** The access chain (if computed) */
  chain?: ComputeSlotChain;
}

/**
 * Analyze a storage slot value to determine what variable it accesses
 *
 * This is the main entry point for understanding storage accesses.
 * Given a slot value (from a read/write instruction), determines:
 * - What storage variable is being accessed
 * - The pointer expression to reach that location
 *
 * SAFETY: Returns null for anything we can't confidently analyze
 *
 * @param slotValue The slot value from a read/write instruction
 * @param block The current block
 * @param storageDecls Storage variable declarations
 * @returns Storage access info or null
 */
export function analyzeStorageSlot(
  slotValue: Ir.Value,
  block: Ir.Block,
  storageDecls: Ast.Declaration.Storage[],
): StorageAccessInfo | null {
  // Case 1: Direct constant slot (simple variable access)
  if (slotValue.kind === "const") {
    const slot = Number(slotValue.value);
    const decl = storageDecls.find((d) => d.slot === slot);

    if (!decl) {
      // Unknown storage slot
      return null;
    }

    return {
      variableName: decl.name,
      declaration: decl,
      pointer: {
        location: "storage",
        slot,
      },
    };
  }

  // Case 2: Computed slot (mapping/array/struct access)
  if (slotValue.kind === "temp") {
    const chain = findComputeSlotChain(block, slotValue.id);
    if (!chain) {
      // Can't analyze the chain
      return null;
    }

    const base = findBaseStorageVariable(chain, storageDecls);
    if (!base) {
      // Can't find base variable
      return null;
    }

    // We have a complete chain! But we need to translate it to a pointer
    // For now, just return the simple base pointer
    // The translation will be added in the next phase
    return {
      variableName: base.name,
      declaration: base.declaration,
      pointer: {
        location: "storage",
        slot: base.slot,
      },
      chain,
    };
  }

  // Unknown slot value kind
  return null;
}
