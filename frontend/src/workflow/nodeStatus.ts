import type { ExecutionNodeStatus } from "../components/workflow/ExecutionStepNode";
import type { ExecutionDetail, ExecutionEvent, ExecutionStatus } from "../api/types";
import { NODE_IDS, NODE_ORDER, type NodeId } from "./graph";
import { hasUnresolvedIssues, ISSUE_STATUSES } from "./executionStatus";

// El nodo 1 (Cargar documentos) es exclusivamente sobre subir/almacenar el archivo,
// algo que ya ocurrió de forma sincrónica antes de que exista la Execution — por eso
// nunca aparece como "activo" ni "con error" acá: la extracción (OCR) y el mapeo son
// responsabilidad del nodo 2 (Tipo de documento).
const STATUS_TO_ACTIVE_NODE: Partial<Record<ExecutionStatus, NodeId>> = {
  pending: NODE_IDS.documentType,
  extracting: NODE_IDS.documentType,
  mapping: NODE_IDS.documentType,
  validating: NODE_IDS.validation,
  needs_review: NODE_IDS.destination,
  completed: NODE_IDS.destination,
};

// a que nodo pertenece cada stage de ExecutionEvent (misma idea que PipelineStepper)
const STAGE_TO_NODE: Record<string, NodeId> = {
  extraction: NODE_IDS.documentType,
  mapping: NODE_IDS.documentType,
  validation: NODE_IDS.validation,
};

function getFailedNode(events: ExecutionEvent[]): NodeId {
  for (let i = events.length - 1; i >= 0; i--) {
    const node = STAGE_TO_NODE[events[i].stage];
    if (node) return node;
  }
  return NODE_IDS.documentType;
}

export function computeNodeStatuses(execution: ExecutionDetail): Record<NodeId, ExecutionNodeStatus> {
  const statuses: Record<NodeId, ExecutionNodeStatus> = {
    trigger: "pending",
    documentType: "pending",
    validation: "pending",
    destination: "pending",
  };

  if (execution.status === "error") {
    const failedNode = getFailedNode(execution.events);
    const failedIndex = NODE_ORDER.indexOf(failedNode);
    NODE_ORDER.forEach((id, i) => {
      statuses[id] = i < failedIndex ? "done" : i === failedIndex ? "error" : "pending";
    });
    return statuses;
  }

  const pendingIssues = hasUnresolvedIssues(execution);

  const activeNode = STATUS_TO_ACTIVE_NODE[execution.status] ?? NODE_IDS.documentType;
  const activeIndex = NODE_ORDER.indexOf(activeNode);
  NODE_ORDER.forEach((id, i) => {
    if (i < activeIndex) statuses[id] = "done";
    else if (i === activeIndex) {
      if (execution.status === "completed" || execution.status === "needs_review") {
        statuses[id] = pendingIssues ? "warning" : "done";
      } else {
        statuses[id] = "active";
      }
    }
  });

  // Un campo "warning" (fuera de rango) no bloquea la ejecución general, pero igual
  // conviene notificarlo visualmente en el nodo de Validaciones aunque todo lo demás
  // haya terminado "completed" — deja de marcarse una vez que ese campo se resuelve.
  if (statuses.validation === "done" && execution.mapped_fields.some((f) => f.status === "warning" && !f.resolved)) {
    statuses.validation = "warning";
  }

  return statuses;
}

export function nodeSummary(nodeId: NodeId, execution: ExecutionDetail, status: ExecutionNodeStatus): string {
  if (status === "error") return execution.error_message ?? "Ocurrió un error en este paso.";

  switch (nodeId) {
    case "trigger":
      return `Documento recibido: ${execution.document_filename}`;
    case "documentType":
      if (status === "pending") return "Esperando...";
      if (status === "active") return "Extrayendo campos según el tipo de documento...";
      return `${execution.mapped_fields.length} campo(s) extraídos — "${execution.document_type_name}" v${execution.document_type_version_number}`;
    case "validation": {
      if (status === "pending") return "Esperando...";
      if (status === "active") return "Validando campos...";
      const okCount = execution.mapped_fields.filter((f) => f.status === "ok").length;
      const unresolvedCount = execution.mapped_fields.filter((f) => ISSUE_STATUSES.has(f.status) && !f.resolved).length;
      const resolvedCount = execution.mapped_fields.filter((f) => ISSUE_STATUSES.has(f.status) && f.resolved).length;
      const threshold = execution.confidence_threshold_used;
      const parts = [`${okCount} ok`];
      if (unresolvedCount > 0) parts.push(`${unresolvedCount} a revisar`);
      if (resolvedCount > 0) parts.push(`${resolvedCount} resuelto(s)`);
      return `Umbral ${threshold != null ? threshold.toFixed(2) : "—"} · ${parts.join(", ")}`;
    }
    case "destination":
      if (status === "pending") return "Esperando resultado final...";
      if (status === "warning") return "Guardado — algunos campos requieren revisión manual.";
      if (status === "done") {
        return execution.status === "needs_review"
          ? "Guardado — revisado y corregido manualmente."
          : "Guardado en la base de datos interna.";
      }
      return "";
  }
}
