import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useExecutions } from "../api/executions";
import { useWorkflows } from "../api/workflows";
import { Spinner } from "../components/common/Spinner";

export function ReviewPage() {
  const { data: executions, isLoading } = useExecutions({ hasIssues: true });
  const { data: workflows } = useWorkflows();

  const workflowName = (id: string | null) => workflows?.find((w) => w.id === id)?.name;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-header" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span className="icon-badge" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
          <AlertTriangle size={18} />
        </span>
        <div>
          <h2 style={{ margin: 0 }}>Revisión</h2>
          <p style={{ margin: "4px 0 0" }}>
            Ejecuciones con campos de baja confianza, obligatorios ausentes, o fuera de un umbral definido.
          </p>
        </div>
      </div>

      {isLoading && <Spinner center size={28} />}

      {executions && executions.length === 0 && (
        <div className="empty-state">
          <div
            className="icon-badge icon-badge-lg"
            style={{ margin: "0 auto 16px", background: "var(--success-bg)", color: "var(--success)" }}
          >
            <AlertTriangle size={26} />
          </div>
          <h3>Nada pendiente</h3>
          <p>No hay ejecuciones esperando revisión en este momento.</p>
        </div>
      )}

      {executions && executions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {executions.map((exec) => (
            <div
              key={exec.id}
              className="card"
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}
            >
              <span className="icon-badge" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                <AlertTriangle size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 14 }}>
                  {!exec.seen && (
                    <span
                      title="Sin ver"
                      style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--danger)", flexShrink: 0 }}
                    />
                  )}
                  {workflowName(exec.workflow_id) ?? `Documento ${exec.document_id}`} — Ejecución {exec.id}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {new Date(exec.started_at).toLocaleString()}
                </div>
              </div>
              <span className="badge badge-warning">
                {exec.status === "needs_review" ? "Requiere revisión" : "Advertencia"}
              </span>
              {exec.workflow_id != null ? (
                <Link to={`/workflows/${exec.workflow_id}/ejecuciones/${exec.id}`} className="btn">
                  Ver detalle →
                </Link>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Sin flujo asociado</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
