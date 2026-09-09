import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  History,
  Pencil,
  Play,
  Plus,
  PlayCircle,
  Trash2,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { api } from "../api/client";
import { useDocumentTypes } from "../api/documentTypes";
import { Spinner } from "../components/common/Spinner";
import { useUploadDocument } from "../api/documents";
import { useCreateExecution, useExecutions } from "../api/executions";
import {
  useDeleteWorkflow,
  usePauseWorkflow,
  useResumeWorkflow,
  useWorkflows,
} from "../api/workflows";
import type { Execution, Workflow } from "../api/types";

const STATUS_BADGE: Record<string, string> = {
  pending: "badge-progress",
  extracting: "badge-progress",
  mapping: "badge-progress",
  validating: "badge-progress",
  needs_review: "badge-warning",
  completed: "badge-success",
  error: "badge-danger",
};

// una ejecución en needs_review que ya no tiene campos sin resolver se muestra como
// resuelta en vez de seguir pareciendo un problema pendiente
function executionStatusBadge(exec: Execution): { label: string; cls: string } {
  if (exec.status === "needs_review" && !exec.has_unresolved_issues) {
    return { label: "resuelta", cls: "badge-success" };
  }
  return { label: exec.status, cls: STATUS_BADGE[exec.status] ?? "" };
}

function WorkflowHistoryPanel({ workflow }: { workflow: Workflow }) {
  const { data: executions } = useExecutions({ workflowId: workflow.id });
  const uploadDocument = useUploadDocument();
  const createExecution = useCreateExecution();

  const handleRun = async (file: File) => {
    const doc = await uploadDocument.mutateAsync(file);
    await createExecution.mutateAsync({ documentId: doc.id, workflowId: workflow.id });
  };

  const isRunning = uploadDocument.isPending || createExecution.isPending;

  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <History size={15} /> Historial de ejecuciones
        </span>
        {workflow.status === "active" ? (
          <label className="btn btn-primary" style={{ fontSize: 12, cursor: "pointer" }}>
            <Play size={13} /> {isRunning ? "Ejecutando..." : "Ejecutar"}
            <input
              type="file"
              style={{ display: "none" }}
              disabled={isRunning}
              onChange={(e) => e.target.files?.[0] && handleRun(e.target.files[0])}
            />
          </label>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Flujo pausado — reanúdalo para ejecutar</span>
        )}
      </div>

      {!executions || executions.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Todavía no hay ejecuciones para este flujo.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Estado</th>
              <th>Inicio</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {executions.slice(0, 8).map((exec) => (
              <tr key={exec.id}>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{exec.id}</td>
                <td>
                  <span className={`badge ${executionStatusBadge(exec).cls}`}>{executionStatusBadge(exec).label}</span>
                </td>
                <td>{new Date(exec.started_at).toLocaleString()}</td>
                <td>
                  <Link to={`/workflows/${workflow.id}/ejecuciones/${exec.id}`} style={{ fontSize: 12 }}>
                    Ver detalle →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function WorkflowsListPage() {
  const { data: workflows, isLoading } = useWorkflows();
  const { data: documentTypes } = useDocumentTypes();
  const deleteWorkflow = useDeleteWorkflow();
  const pauseWorkflow = usePauseWorkflow();
  const resumeWorkflow = useResumeWorkflow();
  const [expandedId, setExpandedId] = useState<string>();

  const typeName = (id: string | null) => documentTypes?.find((t) => t.id === id)?.name ?? "sin tipo configurado";

  const handleDelete = async (workflow: Workflow) => {
    const related = await api.get<Execution[]>(`/executions?workflow_id=${workflow.id}`);
    const message =
      related.length > 0
        ? `El flujo "${workflow.name}" tiene ${related.length} ejecución(es) asociada(s) (incluidas las pendientes de revisión). Si lo eliminas, esas ejecuciones y sus resultados también se eliminarán de forma permanente. ¿Eliminar de todas formas?`
        : `¿Eliminar el flujo "${workflow.name}"? Esta acción no se puede deshacer.`;
    if (window.confirm(message)) {
      deleteWorkflow.mutate(workflow.id);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span
            className="icon-badge"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "white" }}
          >
            <WorkflowIcon size={18} />
          </span>
          <div>
            <h2 style={{ margin: 0 }}>Workflows</h2>
            <p style={{ margin: "4px 0 0" }}>
              Diseña el flujo: cargar documento → tipo a extraer → validaciones → destino de los resultados.
            </p>
          </div>
        </div>
        <Link to="/workflows/nuevo" className="btn btn-primary">
          <Plus size={16} /> Crear flujo
        </Link>
      </div>

      {isLoading && <Spinner center size={28} />}

      {workflows && workflows.length === 0 && (
        <div className="empty-state">
          <div
            className="icon-badge icon-badge-lg"
            style={{ margin: "0 auto 16px", background: "var(--neutral-bg)", color: "var(--text-muted)" }}
          >
            <WorkflowIcon size={26} />
          </div>
          <h3>Todavía no existe ningún flujo</h3>
          <p>Crea el primero para empezar a procesar documentos.</p>
        </div>
      )}

      {workflows && workflows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {workflows.map((w) => {
            const expanded = expandedId === w.id;
            return (
              <div key={w.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px" }}>
                  <button
                    className="icon-btn"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => setExpandedId(expanded ? undefined : w.id)}
                    title="Ver historial de ejecuciones"
                  >
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  <span className="icon-badge" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
                    <WorkflowIcon size={17} />
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{typeName(w.document_type_id)}</div>
                  </div>

                  <span className={`badge ${w.status === "active" ? "badge-success" : ""}`}>
                    {w.status === "active" ? "Activo" : "Pausado"}
                  </span>

                  <div style={{ display: "flex", gap: 6 }}>
                    <Link to={`/workflows/${w.id}`} className="btn" style={{ padding: "6px 10px" }} title="Editar">
                      <Pencil size={14} />
                    </Link>
                    {w.status === "active" ? (
                      <button
                        className="btn"
                        style={{ padding: "6px 10px" }}
                        title="Pausar"
                        onClick={() => pauseWorkflow.mutate(w.id)}
                      >
                        <Ban size={14} />
                      </button>
                    ) : (
                      <button
                        className="btn"
                        style={{ padding: "6px 10px" }}
                        title="Reanudar"
                        onClick={() => resumeWorkflow.mutate(w.id)}
                      >
                        <PlayCircle size={14} />
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      title="Eliminar"
                      onClick={() => handleDelete(w)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {expanded && <WorkflowHistoryPanel workflow={w} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
