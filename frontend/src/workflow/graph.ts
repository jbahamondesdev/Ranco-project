// Única fuente de verdad para el orden fijo de los 4 pasos que comparten
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
