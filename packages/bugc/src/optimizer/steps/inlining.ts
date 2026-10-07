/**
 * Function inlining (level 2).
 *
 * Replaces calls to eligible internal functions with a copy of
 * the callee's body spliced into the caller, so no runtime
 * JUMP/frame is used. Each inlined instruction is annotated with
 * `transform: ["inline"]` and the body is bracketed by a virtual
 * invoke/return (identity + declaration, no code target — the
 * #213 optional-target signal) so a debugger can reconstruct a
 * virtual activation.
 *
 * Current eligibility: internal (user-defined), non-recursive callee
 * that is either a leaf (calls nothing) or below a small size
 * threshold. Applied at all call sites; a callee whose every
 * site is inlined is deleted.
 */
import * as Ir from "#ir";
import type * as Format from "@ethdebug/format";

import {
  BaseOptimizationStep,
  type OptimizationContext,
} from "../optimizer.js";

/** Max IR-node count for a non-leaf callee to still inline. Tunable. */
const INLINE_MAX_IR_NODES = 16;

export class InliningStep extends BaseOptimizationStep {
  name = "inlining";
  private siteCounter = 0;

  run(module: Ir.Module, _context: OptimizationContext): Ir.Module {
    const optimized = this.cloneModule(module);
    if (!optimized.functions || optimized.functions.size === 0) {
      return optimized;
    }

    const callGraph = buildCallGraph(optimized);
    const eligible = new Set<string>();
    for (const [name, fn] of optimized.functions) {
      if (isEligible(name, fn, callGraph)) eligible.add(name);
    }
    if (eligible.size === 0) return optimized;

    // Track, per callee, how many sites remain un-inlined so we
    // can delete fully-inlined callees afterward.
    const remainingSites = new Map<string, number>();
    for (const name of eligible) remainingSites.set(name, 0);

    // Named callers. Self-recursive callers are skipped: they are
    // TailCall-optimized later, and inlining a helper into a
    // self-recursive call's arguments (e.g. `count(succ(n))` ->
    // `count(n + 1)`) rewrites the tail call into a computed-arg
    // form that TCO mishandles, silently breaking the recursion.
    // Correctness over coverage — inlining into recursive bodies is
    // deferred.
    const named: [string, Ir.Function][] = [
      ["<main>", optimized.main],
      ...(optimized.create
        ? ([["<create>", optimized.create]] as [string, Ir.Function][])
        : []),
      ...[...optimized.functions].map(
        ([n, f]) => [n, f] as [string, Ir.Function],
      ),
    ];

    for (const [callerName, caller] of named) {
      // Self-recursive (pre-TCO) or already TCO'd (post-TCO, its
      // self-call is now a jump-with-tailCall so the call graph no
      // longer shows the recursion). Either way, don't inline into
      // it.
      if (reachableCallees(callerName, callGraph).has(callerName)) continue;
      if (hasTailCallBackedge(caller)) continue;
      this.inlineIntoFunction(caller, optimized, eligible, remainingSites);
    }

    // Delete callees that no longer have any call site anywhere.
    for (const name of eligible) {
      if (!isCalledAnywhere(name, optimized)) {
        optimized.functions.delete(name);
      }
    }

    return optimized;
  }

  private inlineIntoFunction(
    caller: Ir.Function,
    module: Ir.Module,
    eligible: Set<string>,
    _remainingSites: Map<string, number>,
  ): void {
    // Snapshot block ids up front; we mutate the map as we splice.
    let changed = true;
    // Guard against pathological loops.
    let guard = 0;
    while (changed && guard++ < 1000) {
      changed = false;
      for (const [blockId, block] of caller.blocks) {
        const term = block.terminator;
        if (term.kind !== "call") continue;
        if (!eligible.has(term.function)) continue;
        const callee = module.functions?.get(term.function);
        if (!callee) continue;
        // Don't inline a function into itself.
        if (callee === caller) continue;

        this.spliceCall(caller, blockId, block, term, callee);
        changed = true;
        break; // block map mutated — restart the scan
      }
    }
  }

  private spliceCall(
    caller: Ir.Function,
    callBlockId: string,
    callBlock: Ir.Block,
    call: Extract<Ir.Block.Terminator, { kind: "call" }>,
    callee: Ir.Function,
  ): void {
    const site = this.siteCounter++;
    const prefix = `inl${site}$`;

    // --- build rename maps ---
    const blockRename = new Map<string, string>();
    for (const id of callee.blocks.keys()) {
      blockRename.set(id, prefix + id);
    }

    // param temp id -> bound argument Value
    const paramSubst = new Map<string, Ir.Value>();
    callee.parameters.forEach((p, i) => {
      const arg = call.arguments[i];
      if (arg) paramSubst.set(p.tempId, arg);
    });

    // every non-param temp defined in the callee -> fresh id
    const idRename = new Map<string, string>();
    for (const b of callee.blocks.values()) {
      for (const phi of b.phis ?? []) rename(phi.dest);
      for (const inst of b.instructions) {
        if ("dest" in inst && typeof inst.dest === "string") {
          rename(inst.dest);
        }
      }
    }
    function rename(id: string): void {
      if (paramSubst.has(id)) return;
      if (!idRename.has(id)) idRename.set(id, prefix + id);
    }

    const inlineSites = (debug: Ir.Instruction.Debug | undefined) =>
      inlineSitesFor(prefix, debug);

    const remapValue = (v: Ir.Value): Ir.Value => {
      if (v.kind !== "temp") return v;
      const sub = paramSubst.get(v.id);
      if (sub) return sub;
      const nid = idRename.get(v.id);
      return nid ? { ...v, id: nid } : v;
    };

    // Declaration for the callee (for the virtual invoke/return).
    const declaration =
      callee.loc && callee.sourceId
        ? { source: { id: callee.sourceId }, range: callee.loc }
        : undefined;

    const inlineInvoke: Format.Program.Context.Invoke["invoke"] = {
      jump: true,
      identifier: callee.name,
      ...(declaration ? { declaration } : {}),
      // no `target` — JUMP is elided (virtual activation)
    };
    const inlineReturn: Format.Program.Context.Return["return"] = {
      identifier: callee.name,
      ...(declaration ? { declaration } : {}),
    };

    // The call site's own source range (e.g. `square(a)`). Inlining
    // replaces the real call, and jump-optimization later folds the
    // entry jump that would carry it — so without this the call site
    // maps to no instruction. Preserve it by gathering it onto the
    // entry instruction alongside the callee-body range it collides
    // with (two source ranges that both apply → gather).
    //
    // An inlined function whose entry block is empty (it starts with
    // a call) leaves its invoke pending on that call: inlining the
    // call puts it on the callee's first instruction, before the
    // callee's own. Likewise, an inlined function whose return block
    // is empty (it returns a call's result) leaves its return pending
    // on the jump from that block, which is this call's continuation:
    // inlining the call puts it after the callee's own return.
    const pendingInvokes = Ir.Utils.activationsOf(
      call.operationDebug?.context,
      "invoke",
    );
    const callDebug = withoutActivationsDebug(call.operationDebug);
    const callSiteCode = (callDebug.context as { code?: unknown } | undefined)
      ?.code;

    const continuation = caller.blocks.get(call.continuation);
    const pendingReturns =
      continuation &&
      continuation.instructions.length === 0 &&
      continuation.terminator.kind === "jump" &&
      !continuation.terminator.tailCall
        ? Ir.Utils.activationsOf(
            continuation.terminator.operationDebug?.context,
            "return",
          )
        : [];
    // The placement once the callee (and any pending returns) has
    // returned: the caller's, at the call or past those returns
    let after = callDebug;
    if (pendingReturns.length > 0) {
      after = withoutActivationsDebug(continuation!.terminator.operationDebug);
      continuation!.terminator.operationDebug = after;
    }
    const invokes = [...pendingInvokes, inlineInvoke];
    const returns = [inlineReturn, ...pendingReturns];
    // The jump back to the continuation runs past the callee's return:
    // it is the caller's code, with no `inline` transform of its own.
    const returnedJump: Ir.Instruction.Debug = { ...after };

    const entryBlockId = blockRename.get(callee.entry)!;
    const returnBlockIds: string[] = [];

    // --- clone + remap callee blocks ---
    for (const [origId, origBlock] of callee.blocks) {
      const newId = blockRename.get(origId)!;

      const instructions: Ir.Instruction[] = origBlock.instructions.map(
        (inst) => {
          const cloned = remapInstruction(inst, remapValue, idRename);
          const sites = inlineSites(inst.operationDebug);
          // Mark every inlined instruction for membership.
          cloned.operationDebug = Ir.Utils.addTransform(
            cloned.operationDebug,
            "inline",
          );
          cloned.operationDebug.inlineSites = sites;
          const returned = cloned.operationDebug.returned;
          if (returned) {
            cloned.operationDebug.returned = {
              ...returned,
              inlineSites: inlineSites(returned),
            };
          }
          return cloned;
        },
      );

      const phis: Ir.Block.Phi[] = (origBlock.phis ?? []).map((phi) =>
        remapPhi(phi, remapValue, idRename, blockRename),
      );

      let terminator: Ir.Block.Terminator;
      const t = origBlock.terminator;
      if (t.kind === "return") {
        returnBlockIds.push(newId);
        // return -> jump to the caller's continuation. Once the
        // callee has returned, this jump is the caller's code: it
        // keeps the caller's source range, inline sites and origin,
        // so it lists the caller's variables, not the callee's locals.
        terminator = {
          kind: "jump",
          target: call.continuation,
          operationDebug: { ...returnedJump },
        };
      } else {
        // The body's own control flow (an `if`'s branch, the jumps
        // between its blocks) is part of the body, too
        terminator = remapTerminator(t, remapValue, blockRename);
        terminator.operationDebug = {
          ...Ir.Utils.addTransform(terminator.operationDebug, "inline"),
          inlineSites: inlineSites(t.operationDebug),
          ...(t.operationDebug?.origin
            ? { origin: t.operationDebug.origin }
            : {}),
        };
      }
      caller.blocks.set(newId, {
        id: newId,
        phis,
        instructions,
        terminator,
        predecessors: new Set(),
        debug: origBlock.debug,
      });
    }

    // --- the virtual invoke and return ---
    // The invoke rides the body's first instruction, plus the call
    // site's source range (gathered with the callee-body range it
    // collides with); the return rides its last instruction, which
    // lists the caller's variables once returned (`returned`). Empty
    // blocks that only jump on (as when the body starts or ends with
    // an inlined call) are passed over; the jumps past the return are
    // the caller's code. With no instruction to carry it, a marker
    // rides a terminator.
    const inlinedIds = new Set(blockRename.values());
    const jumpsInto = new Map<string, string[]>();
    for (const id of inlinedIds) {
      for (const target of successors(caller.blocks.get(id)!.terminator)) {
        if (inlinedIds.has(target)) {
          jumpsInto.set(target, [...(jumpsInto.get(target) ?? []), id]);
        }
      }
    }
    const isPlainJump = (t: Ir.Block.Terminator) =>
      t.kind === "jump" && !t.tailCall;

    let entryId = entryBlockId;
    for (;;) {
      const block = caller.blocks.get(entryId)!;
      const first = block.instructions[0];
      const t = block.terminator;
      if (first) {
        first.operationDebug = withActivationsDebug(
          callSiteCode === undefined
            ? first.operationDebug
            : gatherCallSite(first.operationDebug, callSiteCode),
          { invokes },
        );
        break;
      }
      if (
        t.kind === "jump" &&
        isPlainJump(t) &&
        jumpsInto.get(t.target)?.length === 1
      ) {
        entryId = t.target;
        continue;
      }
      t.operationDebug = withActivationsDebug(t.operationDebug, { invokes });
      break;
    }

    for (let returnId of returnBlockIds) {
      for (;;) {
        const block = caller.blocks.get(returnId)!;
        const last = block.instructions.at(-1);
        if (last) {
          last.operationDebug = {
            ...withActivationsDebug(last.operationDebug, { returns }),
            returned: after,
          };
          break;
        }
        const from = jumpsInto.get(returnId) ?? [];
        const pred = from.length === 1 ? caller.blocks.get(from[0]) : undefined;
        if (pred && isPlainJump(pred.terminator)) {
          pred.terminator.operationDebug = { ...returnedJump };
          returnId = from[0];
          continue;
        }
        // The jump that carries the return is the body's exit, as a
        // real call's exit JUMP is the callee's: the body runs up to
        // it and through it
        block.terminator.operationDebug = withActivationsDebug(
          Ir.Utils.addTransform(block.terminator.operationDebug, "inline"),
          { returns },
        );
        break;
      }
    }

    // --- carry the callee's locals into the caller ---
    // Each keeps the temp that now holds its value (a parameter's is
    // the call's argument; none if that is a constant) and belongs to
    // this inline site.
    const variables = new Map(caller.ssaVariables);
    for (const [key, ssa] of callee.ssaVariables ?? []) {
      const temp = ssa.temp ?? key;
      const arg = paramSubst.get(temp);
      variables.set(prefix + key, {
        ...ssa,
        temp: arg
          ? arg.kind === "temp"
            ? arg.id
            : undefined
          : (idRename.get(temp) ?? temp),
        inlineSite: prefix + (ssa.inlineSite ?? ""),
      });
    }

    // --- wire the single return value into the caller ---
    // Current eligibility guarantees exactly one return. Substitute the
    // call's dest temp with the (remapped) returned value across the
    // whole caller — no phi, so it's robust to L3 block-merging.
    if (call.dest) {
      const returns = collectReturns(callee, blockRename, remapValue);
      if (returns.length === 1) {
        const value = returns[0].value;
        substituteTemp(caller, call.dest, value);
        // A local the call's result was assigned to now has the
        // returned value's temp (none if that is a constant).
        const local = variables.get(call.dest);
        if (local) {
          variables.set(call.dest, {
            ...local,
            temp: value.kind === "temp" ? value.id : undefined,
          });
        }
      }
    }
    if (variables.size > 0)
      Ir.Utils.setDebugInfo(caller, "ssaVariables", variables);
    Ir.Utils.setDebugInfo(
      caller,
      "origins",
      new Map([...(callee.origins ?? []), ...(caller.origins ?? [])]),
    );

    // --- rewire the calling block: call -> jump into inlined entry ---
    callBlock.terminator = {
      kind: "jump",
      target: entryBlockId,
      operationDebug: callDebug,
    };

    void callBlockId;
    recomputePredecessors(caller);
  }
}

// ---- helpers ----

/**
 * The inline sites of an instruction once inlined through `prefix`:
 * this site, then the sites it was already inlined through, renamed
 * as its callee's locals are.
 */
function inlineSitesFor(
  prefix: string,
  debug: Ir.Instruction.Debug | undefined,
): string[] {
  return [prefix, ...(debug?.inlineSites ?? []).map((s) => prefix + s)];
}

function collectReturns(
  callee: Ir.Function,
  blockRename: Map<string, string>,
  remapValue: (v: Ir.Value) => Ir.Value,
): { block: string; value: Ir.Value }[] {
  const out: { block: string; value: Ir.Value }[] = [];
  for (const [origId, b] of callee.blocks) {
    if (b.terminator.kind === "return" && b.terminator.value) {
      out.push({
        block: blockRename.get(origId)!,
        value: remapValue(b.terminator.value),
      });
    }
  }
  return out;
}

function buildCallGraph(module: Ir.Module): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const fns: [string, Ir.Function][] = [
    ["<main>", module.main],
    ...(module.create
      ? ([["<create>", module.create]] as [string, Ir.Function][])
      : []),
    ...[...(module.functions ?? new Map())].map(
      ([n, f]) => [n, f] as [string, Ir.Function],
    ),
  ];
  for (const [name, fn] of fns) {
    const callees = new Set<string>();
    for (const b of fn.blocks.values()) {
      if (b.terminator.kind === "call") callees.add(b.terminator.function);
    }
    graph.set(name, callees);
  }
  return graph;
}

function reachableCallees(
  start: string,
  graph: Map<string, Set<string>>,
): Set<string> {
  const seen = new Set<string>();
  const stack = [...(graph.get(start) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const c of graph.get(n) ?? []) stack.push(c);
  }
  return seen;
}

function functionSize(fn: Ir.Function): number {
  let n = 0;
  for (const b of fn.blocks.values()) {
    n += b.instructions.length + 1; // + terminator
    n += (b.phis ?? []).length;
  }
  return n;
}

function hasTailCallBackedge(fn: Ir.Function): boolean {
  for (const b of fn.blocks.values()) {
    if (b.terminator.kind === "jump" && b.terminator.tailCall) return true;
  }
  return false;
}

function returnCount(fn: Ir.Function): number {
  let n = 0;
  for (const b of fn.blocks.values()) {
    if (b.terminator.kind === "return") n += 1;
  }
  return n;
}

function isEligible(
  name: string,
  fn: Ir.Function,
  graph: Map<string, Set<string>>,
): boolean {
  const callees = graph.get(name) ?? new Set();
  // Non-recursive: name not reachable from itself.
  if (reachableCallees(name, graph).has(name)) return false;
  // For now, single return point only. Multi-return needs a phi at the
  // continuation, which block-merging (L3) can turn into an
  // invalid self-referential phi; deferred until that's handled.
  if (returnCount(fn) !== 1) return false;
  // Never inline a TCO-transformed function: after TailCall
  // optimization a self-recursive function's back-edge becomes a
  // `jump` with `tailCall`, which makes it look like a leaf
  // single-return function on the next fixpoint iteration. Inlining
  // it would clobber the tailcall showcase. A `tailCall` back-edge
  // marks it as recursion, not a real leaf.
  for (const b of fn.blocks.values()) {
    if (b.terminator.kind === "jump" && b.terminator.tailCall) return false;
  }
  // For now, leaf callees only. Inlining a non-leaf callee whose own
  // (eligible) calls also inline exposes a dest-substitution
  // ordering bug in the nested chain; deferred. The size-threshold
  // branch is kept for when that lands.
  const isLeaf = callees.size === 0;
  const smallEnough = functionSize(fn) <= INLINE_MAX_IR_NODES;
  void smallEnough;
  return isLeaf;
}

function isCalledAnywhere(name: string, module: Ir.Module): boolean {
  const fns = [
    module.main,
    ...(module.create ? [module.create] : []),
    ...(module.functions?.values() ?? []),
  ];
  for (const fn of fns) {
    for (const b of fn.blocks.values()) {
      if (b.terminator.kind === "call" && b.terminator.function === name) {
        return true;
      }
    }
  }
  return false;
}

/** Deep-clone an instruction, remapping temp values and its dest. */
function remapInstruction(
  inst: Ir.Instruction,
  remapValue: (v: Ir.Value) => Ir.Value,
  idRename: Map<string, string>,
): Ir.Instruction {
  const cloned = structuredCloneValues(inst) as Ir.Instruction & {
    dest?: string;
  };
  remapValuesInPlace(cloned, remapValue);
  if (typeof cloned.dest === "string") {
    cloned.dest = idRename.get(cloned.dest) ?? cloned.dest;
  }
  return cloned;
}

function remapPhi(
  phi: Ir.Block.Phi,
  remapValue: (v: Ir.Value) => Ir.Value,
  idRename: Map<string, string>,
  blockRename: Map<string, string>,
): Ir.Block.Phi {
  const sources = new Map<string, Ir.Value>();
  for (const [pred, val] of phi.sources) {
    sources.set(blockRename.get(pred) ?? pred, remapValue(val));
  }
  return {
    ...phi,
    dest: idRename.get(phi.dest) ?? phi.dest,
    sources,
  };
}

function remapTerminator(
  t: Ir.Block.Terminator,
  remapValue: (v: Ir.Value) => Ir.Value,
  blockRename: Map<string, string>,
): Ir.Block.Terminator {
  switch (t.kind) {
    case "jump":
      return { ...t, target: blockRename.get(t.target) ?? t.target };
    case "branch":
      return {
        ...t,
        condition: remapValue(t.condition),
        trueTarget: blockRename.get(t.trueTarget) ?? t.trueTarget,
        falseTarget: blockRename.get(t.falseTarget) ?? t.falseTarget,
      };
    case "return":
      return { ...t, value: t.value ? remapValue(t.value) : undefined };
    case "call":
      return {
        ...t,
        arguments: t.arguments.map(remapValue),
        dest: t.dest,
        continuation: blockRename.get(t.continuation) ?? t.continuation,
      };
  }
}

/** Deep clone that preserves nested plain objects and bigints. */
function structuredCloneValues<T>(obj: T): T {
  return structuredClone(obj);
}

/** Recursively rewrite any temp Value in place. */
function remapValuesInPlace(
  node: unknown,
  remapValue: (v: Ir.Value) => Ir.Value,
): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (
      child &&
      typeof child === "object" &&
      (child as { kind?: string }).kind === "temp" &&
      typeof (child as { id?: unknown }).id === "string"
    ) {
      obj[key] = remapValue(child as Ir.Value);
    } else if (Array.isArray(child)) {
      child.forEach((el, i) => {
        if (
          el &&
          typeof el === "object" &&
          (el as { kind?: string }).kind === "temp"
        ) {
          child[i] = remapValue(el as Ir.Value);
        } else {
          remapValuesInPlace(el, remapValue);
        }
      });
    } else if (child && typeof child === "object") {
      remapValuesInPlace(child, remapValue);
    }
  }
}

/** Replace every use of temp `id` with `value` across the function. */
function substituteTemp(fn: Ir.Function, id: string, value: Ir.Value): void {
  const sub = (v: Ir.Value): Ir.Value =>
    v.kind === "temp" && v.id === id ? value : v;
  for (const b of fn.blocks.values()) {
    for (const inst of b.instructions) {
      remapValuesInPlace(inst, sub);
    }
    for (const phi of b.phis ?? []) {
      for (const [pred, val] of phi.sources) {
        phi.sources.set(pred, sub(val));
      }
    }
    b.terminator = remapTerminator(b.terminator, sub, new Map());
  }
}

/** The blocks a terminator goes on to */
function successors(t: Ir.Block.Terminator): string[] {
  return t.kind === "jump"
    ? [t.target]
    : t.kind === "branch"
      ? [t.trueTarget, t.falseTarget]
      : t.kind === "call"
        ? [t.continuation]
        : [];
}

function recomputePredecessors(fn: Ir.Function): void {
  for (const b of fn.blocks.values()) b.predecessors = new Set();
  for (const [id, b] of fn.blocks) {
    for (const tgt of successors(b.terminator)) {
      fn.blocks.get(tgt)?.predecessors.add(id);
    }
  }
}

// ---- debug-context composition ----

/** A debug with activation discriminators added (see
 * `Ir.Utils.withActivations`) */
function withActivationsDebug(
  debug: Ir.Instruction.Debug,
  activations: { invokes?: unknown[]; returns?: unknown[] },
): Ir.Instruction.Debug {
  const context = Ir.Utils.withActivations(debug.context, activations);
  return { ...debug, ...(context ? { context } : {}) };
}

/** A debug without activation discriminators */
function withoutActivationsDebug(
  debug: Ir.Instruction.Debug | undefined,
): Ir.Instruction.Debug {
  const { context: _, ...rest } = debug ?? {};
  const context = Ir.Utils.withoutActivations(debug?.context);
  return { ...rest, ...(context ? { context } : {}) };
}

/**
 * Preserve the call site's `code` range on the entry instruction.
 * The instruction already maps to the callee body, so the two source
 * ranges collide on `code` and are gathered — both apply. The
 * callee-body context (with its invoke/transform siblings) stays a
 * single gather child so consumers still see those discriminators on
 * a leaf, rather than as siblings of `gather`.
 */
function gatherCallSite(
  debug: Ir.Instruction.Debug,
  callSiteCode: unknown,
): Ir.Instruction.Debug {
  const existing = (debug.context ?? {}) as Record<string, unknown>;
  const callSite = { code: callSiteCode };

  if ("gather" in existing && Array.isArray(existing.gather)) {
    // Already a gather — add the call site as another child.
    return {
      ...debug,
      context: {
        ...existing,
        gather: [callSite, ...(existing.gather as unknown[])],
      } as Format.Program.Context,
    };
  }
  if ("code" in existing) {
    // Colliding `code` keys — gather both.
    return {
      ...debug,
      context: { gather: [callSite, existing] } as Format.Program.Context,
    };
  }
  // No existing `code` — compose flat.
  return {
    ...debug,
    context: { ...existing, code: callSiteCode } as Format.Program.Context,
  };
}
