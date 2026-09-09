import type { ExecutionDetail, ExecutionStatus } from "../api/types";

export const STATUS_BADGE: Record<string, string> = {
  pending: "badge-progress",
  extracting: "badge-progress",
  mapping: "badge-progress",
  validating: "badge-progress",
  needs_review: "badge-warning",
  completed: "badge-success",
  error: "badge-danger",
};

// estados de MappedField que representan "algo que vale la pena que alguien revise" —
// debe calzar con ISSUE_STATUSES del backend (app/routers/executions.py)
export const ISSUE_STATUSES = new Set(["needs_review", "missing", "warning"]);

// una vez que un campo se corrige o se descarta desde el panel de Validaciones
// (resolved=true) deja de contar como problema pendiente, aunque su "status" original
// siga guardado para dejar rastro de que hubo un problema y cómo se resolvió
export function hasUnresolvedIssues(execution: ExecutionDetail): boolean {
  return execution.mapped_fields.some((f) => ISSUE_STATUSES.has(f.status) && !f.resolved);
}

// el "status" de la ejecución queda fijo como rastro histórico (fue a needs_review por
// algún motivo), pero una vez que ya no quedan campos sin resolver conviene mostrarlo
// como resuelto en vez de seguir pareciendo un problema pendiente
export function displayExecutionStatus(status: ExecutionStatus, hasIssues: boolean): { label: string; badgeClass: string } {
  if (status === "needs_review" && !hasIssues) {
    return { label: "resuelta", badgeClass: "badge-success" };
  }
  return { label: status, badgeClass: STATUS_BADGE[status] ?? "" };
}
