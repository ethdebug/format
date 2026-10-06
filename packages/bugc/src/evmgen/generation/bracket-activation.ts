/**
 * Bracket invoke/return activation discriminators onto the boundary
 * ops of an IR instruction's emitted op-run.
 *
 * A single IR instruction lowers to N EVM micro-ops, and the generic
 * lowering attaches that instruction's whole `operationDebug` (source
 * mapping, variables, transform markers, AND any invoke/return
 * discriminators) to every one of those ops. That is correct for
 * source/variable/transform context — a debugger wants all N ops
 * mapped to the instruction — but WRONG for invoke/return: those are
 * positional activation boundaries. An `invoke` marks a single push
 * point; a `return` a single pop point. Broadcasting them across the
 * whole op-run makes a push/pop reconstruction see every op as both a
 * push and a pop.
 *
 * This module de-smears: for the ops emitted by one instruction, the
 * `invoke` discriminator is kept on only the FIRST op, `return` on only
 * the LAST op, and stripped from the interior. The `transform`
 * membership markers (and source/variables) stay on every op.
 *
 * It is a general evmgen invariant, not inline-specific: it is a no-op
 * for real calls (whose invoke/return already ride single-op JUMP /
 * JUMPDEST terminators) and fires only when invoke/return happen to
 * ride a multi-op instruction — which today is inlined virtual
 * activations.
 */
import type * as Format from "@ethdebug/format";
import type * as Evm from "#evm";
import * as Ir from "#ir";

type Ctx = Format.Program.Context;
type Activation = "invoke" | "return";

function isPick(ctx: Ctx): ctx is Ctx & { pick: Ctx[] } {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "pick" in ctx &&
    Array.isArray((ctx as { pick: unknown }).pick)
  );
}

function isGather(ctx: Ctx): ctx is Ctx & { gather: Ctx[] } {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "gather" in ctx &&
    Array.isArray((ctx as { gather: unknown }).gather)
  );
}

/** Whether ctx carries the given activation key anywhere, reaching
 * into pick/gather composites. */
export function carriesActivation(
  ctx: Ctx | undefined,
  key: Activation,
): boolean {
  if (!ctx || typeof ctx !== "object") return false;
  if (isPick(ctx)) return ctx.pick.some((c) => carriesActivation(c, key));
  if (isGather(ctx)) return ctx.gather.some((c) => carriesActivation(c, key));
  return key in ctx;
}

/** Remove invoke and return discriminators anywhere in ctx, reaching
 * into pick/gather composites. Returns undefined if nothing remains. */
export function stripActivation(ctx: Ctx | undefined): Ctx | undefined {
  if (!ctx || typeof ctx !== "object") return ctx;
  if (isPick(ctx)) {
    const kids = ctx.pick
      .map(stripActivation)
      .filter((c): c is Ctx => c !== undefined);
    if (kids.length === 0) return undefined;
    if (kids.length === 1) return kids[0];
    return { pick: kids } as Ctx;
  }
  if (isGather(ctx)) {
    const kids = ctx.gather
      .map(stripActivation)
      .filter((c): c is Ctx => c !== undefined);
    // Keys beside the gather (e.g. local `variables`) still apply.
    const {
      gather: _,
      invoke: __,
      return: ___,
      ...siblings
    } = ctx as Record<string, unknown>;
    if (Object.keys(siblings).length > 0) {
      return (
        kids.length > 0 ? { ...siblings, gather: kids } : siblings
      ) as Ctx;
    }
    if (kids.length === 0) return undefined;
    if (kids.length === 1) return kids[0];
    return { gather: kids } as Ctx;
  }
  const rest = { ...(ctx as Record<string, unknown>) };
  delete rest.invoke;
  delete rest.return;
  return Object.keys(rest).length > 0 ? (rest as Ctx) : undefined;
}

/**
 * Rewrite the ops emitted by one IR instruction (the slice
 * `instructions[start..end]`, by default to the end) so invokes ride
 * only the first op and returns only the last op, using the
 * discriminators found on the instruction's `operationDebug` context.
 * Several of one kind (an inlined function that starts or ends with
 * an inlined call) keep their order: outermost invoke first, innermost
 * return first. No-op unless that context carries invoke and/or
 * return, so it never touches ordinary code.
 */
export function bracketActivation(
  instructions: Evm.Instruction[],
  start: number,
  operationCtx: Ctx | undefined,
  end: number = instructions.length,
): Evm.Instruction[] {
  if (end <= start) return instructions;

  const invokes = Ir.Utils.activationsOf(operationCtx, "invoke");
  const returns = Ir.Utils.activationsOf(operationCtx, "return");
  if (invokes.length === 0 && returns.length === 0) return instructions;

  const out = instructions.slice();
  for (let i = start; i < end; i++) {
    const op = out[i];
    let ctx = Ir.Utils.withoutActivations(op.debug?.context);
    if (i === start) ctx = Ir.Utils.withActivations(ctx, { invokes });
    if (i === end - 1) ctx = Ir.Utils.withActivations(ctx, { returns });
    out[i] = { ...op, debug: { ...op.debug, context: ctx } };
  }
  return out;
}
