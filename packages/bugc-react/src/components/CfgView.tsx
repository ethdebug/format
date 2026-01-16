/**
 * CfgView component for displaying control flow graphs.
 *
 * Note: This component requires optional peer dependencies:
 * - react-flow-renderer
 * - dagre
 */

import React, { useMemo, useCallback, useState, useEffect } from "react";
import type { Ir } from "@ethdebug/bugc";
import "./CfgView.css";

/**
 * Props for CfgView component.
 */
export interface CfgViewProps {
  /** The IR module to visualize */
  ir: Ir.Module;
  /** Show comparison view (not implemented) */
  showComparison?: boolean;
  /** IR for comparison (not implemented) */
  comparisonIr?: Ir.Module;
}

interface BlockNodeData {
  label: string;
  block: Ir.Block;
  isEntry: boolean;
  instructionCount: number;
  functionName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rfModule: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dagreModule: any;
let dependenciesLoaded = false;

async function loadDependencies(): Promise<boolean> {
  if (dependenciesLoaded) {
    return true;
  }

  try {
    rfModule = await import("react-flow-renderer");
    dagreModule = await import("dagre");
    dependenciesLoaded = true;
    return true;
  } catch {
    return false;
  }
}

function BlockNodeComponent(props: {
  data: BlockNodeData;
  selected: boolean;
}): JSX.Element {
  const { data, selected } = props;

  if (!rfModule) {
    return <div>Loading...</div>;
  }

  const { Handle, Position } = rfModule;

  return (
    <div
      className={`cfg-node ${data.isEntry ? "entry" : ""} ${selected ? "selected" : ""}`}
    >
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <div className="cfg-node-header">
        <strong>
          {data.functionName}::{data.label}
        </strong>
        {data.isEntry && <span className="entry-badge">entry</span>}
      </div>
      <div className="cfg-node-stats">
        {data.instructionCount} instruction
        {data.instructionCount !== 1 ? "s" : ""}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  );
}

function CfgViewContent({ ir }: CfgViewProps): JSX.Element {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  if (!rfModule || !dagreModule) {
    return (
      <div className="cfg-view">
        <div className="cfg-header">
          <h3>Control Flow Graph</h3>
        </div>
        <div className="cfg-content">
          <p>Loading dependencies...</p>
        </div>
      </div>
    );
  }

  const {
    default: ReactFlow,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    useReactFlow,
    MarkerType,
  } = rfModule;

  const dagre = dagreModule;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const reactFlow = useReactFlow();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { initialNodes, initialEdges } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edges: any[] = [];

    const processFunction = (func: Ir.Function, funcName: string) => {
      const blockEntries = Array.from(func.blocks.entries());

      blockEntries.forEach(([blockId, block]) => {
        const nodeId = `${funcName}:${blockId}`;

        nodes.push({
          id: nodeId,
          type: "block",
          position: { x: 0, y: 0 },
          data: {
            label: blockId,
            block,
            isEntry: blockId === func.entry,
            instructionCount: block.instructions.length + 1,
            functionName: funcName,
          },
        });
      });

      blockEntries.forEach(([blockId, block]) => {
        const sourceId = `${funcName}:${blockId}`;
        const term = block.terminator;

        if (term.kind === "jump") {
          const targetId = `${funcName}:${term.target}`;
          edges.push({
            id: `${sourceId}-${targetId}`,
            source: sourceId,
            target: targetId,
            sourceHandle: "bottom",
            targetHandle: "top",
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          });
        } else if (term.kind === "branch") {
          const trueTargetId = `${funcName}:${term.trueTarget}`;
          const falseTargetId = `${funcName}:${term.falseTarget}`;

          edges.push({
            id: `${sourceId}-${trueTargetId}-true`,
            source: sourceId,
            target: trueTargetId,
            sourceHandle: "bottom",
            targetHandle: "top",
            label: "true",
            labelBgStyle: { fill: "#e8f5e9" },
            style: { stroke: "#4caf50" },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#4caf50",
            },
          });
          edges.push({
            id: `${sourceId}-${falseTargetId}-false`,
            source: sourceId,
            target: falseTargetId,
            sourceHandle: "bottom",
            targetHandle: "top",
            label: "false",
            labelBgStyle: { fill: "#ffebee" },
            style: { stroke: "#f44336" },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#f44336",
            },
          });
        } else if (term.kind === "call") {
          const continuationId = `${funcName}:${term.continuation}`;
          edges.push({
            id: `${sourceId}-${continuationId}-call-cont`,
            source: sourceId,
            target: continuationId,
            sourceHandle: "bottom",
            targetHandle: "top",
            label: `after ${term.function}()`,
            labelBgStyle: { fill: "#f3e8ff" },
            style: { stroke: "#9333ea" },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#9333ea",
            },
          });
        }
      });
    };

    if (ir.functions) {
      for (const [funcName, func] of ir.functions.entries()) {
        processFunction(func, funcName);
      }
    }

    if (ir.create) {
      processFunction(ir.create, "create");
    }

    processFunction(ir.main, "main");

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: "TB",
      nodesep: 80,
      ranksep: 120,
      edgesep: 50,
    });

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 200, height: 80 });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - 100,
          y: nodeWithPosition.y - 40,
        },
      };
    });

    return { initialNodes: layoutedNodes, initialEdges: edges };
  }, [ir, MarkerType, dagre]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [nodesState, setNodes, onNodesChange] = useNodesState(initialNodes);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setTimeout(() => {
      reactFlow?.fitView?.({ padding: 0.2, minZoom: 0.1, maxZoom: 2 });
    }, 50);
  }, [initialNodes, initialEdges, setNodes, setEdges, reactFlow]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const onNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_event: React.MouseEvent, node: any) => {
      setSelectedNode(node.id);
    },
    [],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const selectedBlock = useMemo(() => {
    if (!selectedNode) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = nodesState.find((n: any) => n.id === selectedNode);
    return node?.data.block ?? null;
  }, [selectedNode, nodesState]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const selectedBlockName = useMemo(() => {
    if (!selectedNode || selectedNode.includes("-label")) return null;
    return selectedNode.replace(":", "::");
  }, [selectedNode]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const formatInstruction = useCallback((inst: Ir.Instruction): string => {
    const formatValue = (value: unknown): string => {
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "string") return JSON.stringify(value);
      if (typeof value === "boolean") return value.toString();

      const val = value as {
        kind?: string;
        value?: unknown;
        id?: string | number;
        name?: string;
      };
      if (!val.kind) return "?";

      switch (val.kind) {
        case "const":
          return String(val.value || "?");
        case "temp":
          return `%${val.id || "?"}`;
        case "local":
          return `$${val.name || "?"}`;
        default:
          return "?";
      }
    };

    switch (inst.kind) {
      case "const":
        return `${inst.dest} = ${inst.value}`;
      case "binary":
        return `${inst.dest} = ${formatValue(inst.left)} ${inst.op} ${formatValue(inst.right)}`;
      case "unary":
        return `${inst.dest} = ${inst.op}${formatValue(inst.operand)}`;
      case "read":
        if (inst.location === "storage" && inst.slot) {
          return `${inst.dest} = storage[${formatValue(inst.slot)}]`;
        }
        return `${inst.dest} = read.${inst.location}`;
      case "write":
        if (inst.location === "storage" && inst.slot) {
          return `storage[${formatValue(inst.slot)}] = ${formatValue(inst.value)}`;
        }
        return `write.${inst.location} = ${formatValue(inst.value)}`;
      case "env": {
        const envInst = inst as Ir.Instruction.Env;
        switch (envInst.op) {
          case "msg_sender":
            return `${envInst.dest} = msg.sender`;
          case "msg_value":
            return `${envInst.dest} = msg.value`;
          case "msg_data":
            return `${envInst.dest} = msg.data`;
          case "block_timestamp":
            return `${envInst.dest} = block.timestamp`;
          case "block_number":
            return `${envInst.dest} = block.number`;
          default:
            return `${envInst.dest} = ${envInst.op}`;
        }
      }
      case "hash":
        return `${inst.dest} = keccak256(${formatValue(inst.value)})`;
      case "cast":
        return `${inst.dest} = cast ${formatValue(inst.value)} to ${inst.targetType.kind}`;
      case "compute_slot": {
        if (inst.slotKind === "mapping") {
          const mappingInst = inst as Ir.Instruction.ComputeSlot.Mapping;
          return `${mappingInst.dest} = compute_slot[mapping](${formatValue(mappingInst.base)}, ${formatValue(mappingInst.key)})`;
        } else if (inst.slotKind === "array") {
          const arrayInst = inst as Ir.Instruction.ComputeSlot.Array;
          return `${arrayInst.dest} = compute_slot[array](${formatValue(arrayInst.base)})`;
        } else if (inst.slotKind === "field") {
          const fieldInst = inst as Ir.Instruction.ComputeSlot.Field;
          return `${fieldInst.dest} = compute_slot[field](${formatValue(fieldInst.base)}, offset_${fieldInst.fieldOffset})`;
        }
        return `unknown compute_slot`;
      }
      default: {
        const unknownInst = inst as { dest?: string; kind?: string };
        return `${unknownInst.dest || "?"} = ${unknownInst.kind || "unknown"}(...)`;
      }
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const formatTerminator = useCallback((term: Ir.Block.Terminator): string => {
    const formatValue = (value: unknown): string => {
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "string") return JSON.stringify(value);
      if (typeof value === "boolean") return value.toString();

      const val = value as {
        kind?: string;
        value?: unknown;
        id?: string | number;
        name?: string;
      };
      if (!val.kind) return "?";

      switch (val.kind) {
        case "const":
          return String(val.value || "?");
        case "temp":
          return `%${val.id || "?"}`;
        case "local":
          return `$${val.name || "?"}`;
        default:
          return "?";
      }
    };

    switch (term.kind) {
      case "jump":
        return `jump ${term.target}`;
      case "branch":
        return `branch ${formatValue(term.condition)} ? ${term.trueTarget} : ${term.falseTarget}`;
      case "return":
        return term.value ? `return ${formatValue(term.value)}` : "return void";
      case "call": {
        const args = term.arguments.map(formatValue).join(", ");
        const callPart = term.dest
          ? `${term.dest} = call ${term.function}(${args})`
          : `call ${term.function}(${args})`;
        return `${callPart} -> ${term.continuation}`;
      }
      default:
        return `unknown terminator`;
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const nodeTypes = useMemo(() => ({ block: BlockNodeComponent }), []);

  return (
    <div className="cfg-view">
      <div className="cfg-header">
        <h3>Control Flow Graph</h3>
      </div>
      <div className="cfg-content">
        <div className="cfg-graph">
          <ReactFlow
            nodes={nodesState}
            edges={edgesState}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{
              padding: 0.2,
              includeHiddenNodes: false,
              minZoom: 0.1,
              maxZoom: 2,
            }}
            minZoom={0.05}
            maxZoom={4}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        {selectedBlock && selectedBlockName && (
          <div className="cfg-sidebar">
            <h4>
              Block {selectedBlockName}
              <button
                className="cfg-sidebar-close"
                onClick={() => setSelectedNode(null)}
                aria-label="Close sidebar"
              >
                ×
              </button>
            </h4>
            <div className="block-instructions">
              <h5>Instructions:</h5>
              <pre className="instruction-list">
                {selectedBlock.instructions.map(
                  (inst: Ir.Instruction, i: number) => (
                    <div key={i} className="instruction">
                      {formatInstruction(inst)}
                    </div>
                  ),
                )}
                <div className="instruction terminator">
                  {formatTerminator(selectedBlock.terminator)}
                </div>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Displays a control flow graph visualization of the IR.
 *
 * Requires optional peer dependencies: react-flow-renderer, dagre
 *
 * @param props - IR module and options
 * @returns CfgView element
 *
 * @example
 * ```tsx
 * <CfgView ir={compileResult.ir} />
 * ```
 */
export function CfgView(props: CfgViewProps): JSX.Element {
  const [loaded, setLoaded] = useState(dependenciesLoaded);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) {
      loadDependencies()
        .then((success) => {
          if (success) {
            setLoaded(true);
          } else {
            setError(
              "CfgView requires react-flow-renderer and dagre packages. " +
                "Please install them: npm install react-flow-renderer dagre",
            );
          }
        })
        .catch(() => {
          setError("Failed to load CfgView dependencies");
        });
    }
  }, [loaded]);

  if (error) {
    return (
      <div className="cfg-view">
        <div className="cfg-header">
          <h3>Control Flow Graph</h3>
        </div>
        <div className="cfg-content">
          <p style={{ color: "var(--bugc-accent-red)", padding: "1rem" }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!loaded || !rfModule) {
    return (
      <div className="cfg-view">
        <div className="cfg-header">
          <h3>Control Flow Graph</h3>
        </div>
        <div className="cfg-content">
          <p style={{ padding: "1rem" }}>Loading...</p>
        </div>
      </div>
    );
  }

  const { ReactFlowProvider } = rfModule;

  return (
    <ReactFlowProvider>
      <CfgViewContent {...props} />
    </ReactFlowProvider>
  );
}
