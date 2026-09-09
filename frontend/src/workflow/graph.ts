import { MarkerType, type Edge } from "@xyflow/react";

// Única fuente de verdad para la topología fija del grafo de 4 nodos que comparten
// WorkflowEditorPage (edición) y WorkflowExecutionPage (visualización de una ejecución).
export const NODE_IDS = {
  trigger: "trigger",
  documentType: "documentType",
  validation: "validation",
  destination: "destination",
} as const;

export type NodeId = (typeof NODE_IDS)[keyof typeof NODE_IDS];

export const NODE_ORDER: NodeId[] = [
  NODE_IDS.trigger,
  NODE_IDS.documentType,
  NODE_IDS.validation,
  NODE_IDS.destination,
];

const EDGE_STYLE = { stroke: "var(--text-muted)", strokeWidth: 2 };
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: "var(--text-muted)", width: 18, height: 18 };

export const FIXED_EDGES: Edge[] = [
  { id: "e1-2", source: NODE_IDS.trigger, target: NODE_IDS.documentType, style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e2-3", source: NODE_IDS.documentType, target: NODE_IDS.validation, style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e3-4", source: NODE_IDS.validation, target: NODE_IDS.destination, style: EDGE_STYLE, markerEnd: EDGE_MARKER },
];

export const INITIAL_POSITIONS: Record<NodeId, { x: number; y: number }> = {
  trigger: { x: 20, y: 60 },
  documentType: { x: 320, y: 40 },
  validation: { x: 620, y: 40 },
  destination: { x: 920, y: 60 },
};
