import { useMemo, useCallback, useState, useEffect } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type NodeProps,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from "react-flow-renderer";
import dagre from "dagre";
import "react-flow-renderer/dist/style.css";
import type { Ir } from "@ethdebug/bugc";
import "./CfgView.css";

interface CfgViewProps {
  ir: Ir.Module;
  showComparison?: boolean;
  comparisonIr?: Ir.Module;
}

interface BlockNodeData {
  label: string;
  block: Ir.Block;
  isEntry: boolean;
  instructionCount: number;
  functionName?: string;
}

function BlockNode({ data, selected }: NodeProps<BlockNodeData>) {
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

const nodeTypes = {
  block: BlockNode,
};

function CfgViewContent({ ir }: CfgViewProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node<BlockNodeData>[] = [];
    const edges: Edge[] = [];

    const processFunction = (func: Ir.Function, funcName: string) => {
      const blockEntries = Array.from(func.blocks.entries());

      // Create nodes with function name prefix to ensure unique IDs
      blockEntries.forEach(([blockId, block]) => {
        const nodeId = `${funcName}:${blockId}`;

        nodes.push({
          id: nodeId,
          type: "block",
          position: { x: 0, y: 0 }, // Will be set by dagre
          data: {
            label: blockId,
            block,
            isEntry: blockId === func.entry,
            instructionCount: block.instructions.length + 1, // +1 for terminator
            functionName: funcName,
          },
        });
      });

      // Create edges with function name prefix
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
          // Handle call terminator
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

    // Process all functions
    if (ir.functions) {
      for (const [funcName, func] of ir.functions.entries()) {
        processFunction(func, funcName);
      }
    }

    if (ir.create) {
      processFunction(ir.create, "create");
    }

    processFunction(ir.main, "main");

    // Add call edges between blocks and functions
    const allFunctions = new Map<string, Ir.Function>();
    if (ir.functions) {
      ir.functions.forEach((func, name) => allFunctions.set(name, func));
    }
    if (ir.create) {
      allFunctions.set("create", ir.create);
    }
    allFunctions.set("main", ir.main);

    // Call instructions are now terminators, so we don't need this loop anymore

    // Apply dagre layout
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

    // Apply the computed positions
    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - 100, // Center the node
          y: nodeWithPosition.y - 40,
        },
      };
    });

    return { initialNodes: layoutedNodes, initialEdges: edges };
  }, [ir]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when IR changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // Auto-fit view after a short delay to ensure layout is complete
    setTimeout(() => {
      fitView({ padding: 0.2, minZoom: 0.1, maxZoom: 2 });
    }, 50);
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<BlockNodeData>) => {
      setSelectedNode(node.id);
    },
    [],
  );

  const selectedBlock = useMemo(() => {
    if (!selectedNode) return null;
    const node = nodesState.find(
      (n: Node<BlockNodeData>) => n.id === selectedNode,
    );
    return node?.data.block ?? null;
  }, [selectedNode, nodesState]);

  const selectedBlockName = useMemo(() => {
    if (!selectedNode || selectedNode.includes("-label")) return null;
    // Extract the display name from the node ID (e.g., "main:entry" -> "main::entry")
    return selectedNode.replace(":", "::");
  }, [selectedNode]);

  const formatInstruction = useCallback((inst: Ir.Instruction): string => {
    // Recreate the formatting logic from IrFormatter since methods are private
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
        const envInst = inst;
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
        // This should never be reached due to exhaustive checking
        const _exhaustive: never = inst;
        void _exhaustive;
        return `unknown compute_slot`;
      }
      // Call instruction removed - calls are now block terminators
      default: {
        const unknownInst = inst as { dest?: string; kind?: string };
        return `${unknownInst.dest || "?"} = ${unknownInst.kind || "unknown"}(...)`;
      }
    }
  }, []);

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

export function CfgView(props: CfgViewProps) {
  return (
    <ReactFlowProvider>
      <CfgViewContent {...props} />
    </ReactFlowProvider>
  );
}
