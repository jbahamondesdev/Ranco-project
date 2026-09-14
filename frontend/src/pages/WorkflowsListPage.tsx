import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  History,
  Pencil,
  Play,
  Plus,
  PlayCircle,
  Trash2,
  Workflow as WorkflowIcon,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";
import { useDocumentTypes } from "../api/documentTypes";
import { Spinner } from "../components/common/Spinner";
import { useUploadDocument } from "../api/documents";
import { extractErrorMessage } from "../api/errors";
import { getWorkflowExportUrl, useCreateExecution, useExecutions } from "../api/executions";
import {
  useDeleteWorkflow,
  usePauseWorkflow,
  useResumeWorkflow,
  useWorkflows,
} from "../api/workflows";
import { displayExecutionStatus } from "../workflow/executionStatus";
import type { Execution, Workflow } from "../api/types";

type UploadQueueItem = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

function WorkflowHistoryPanel({ workflow }: { workflow: Workflow }) {
  const { data: executions } = useExecutions({ workflowId: workflow.id });
  const uploadDocument = useUploadDocument();
  const createExecution = useCreateExecution();
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);

  // procesa los archivos de a uno (no en paralelo): evita saturar el pipeline local
  // (SQL Server Express + llamadas a Azure) cuando se sueltan varios archivos a la vez
  const handleFiles = async (files: FileList) => {
    const items: UploadQueueItem[] = Array.from(files).map((file) => ({ file, status: "pending" }));
    setQueue(items);
    for (let i = 0; i < items.length; i++) {
      setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "uploading" } : it)));
      try {
        const doc = await uploadDocument.mutateAsync(items[i].file);
        await createExecution.mutateAsync({ documentId: doc.id, workflowId: workflow.id });
        setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "done" } : it)));
      } catch (err) {
        const message = extractErrorMessage(err, "Error desconocido");
        setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "error", error: message } : it)));
      }
    }
  };

  const isRunning = queue.some((it) => it.status === "pending" || it.status === "uploading");

  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <History size={15} /> Historial de ejecuciones
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {executions && executions.length > 0 && (
            <a
              href={getWorkflowExportUrl(workflow.id)}
              className="btn"
              style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Download size={13} /> Exportar CSV
            </a>
          )}
        {workflow.status === "active" ? (
          <label className="btn btn-primary" style={{ fontSize: 12, cursor: "pointer" }}>
            <Play size={13} /> {isRunning ? "Ejecutando..." : "Ejecutar"}
            <input
              type="file"
              multiple
              style={{ display: "none" }}
              disabled={isRunning}
              onChange={(e) => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
            />
          </label>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Flujo pausado — reanúdalo para ejecutar</span>
        )}
        </div>
      </div>

      {queue.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          {queue.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              {item.status === "done" && <CheckCircle2 size={13} color="var(--success)" />}
              {item.status === "error" && <XCircle size={13} color="var(--danger)" />}
              {(item.status === "pending" || item.status === "uploading") && <Spinner size={13} />}
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.file.name}
              </span>
              {item.status === "error" && <span style={{ color: "var(--danger)" }}>{item.error}</span>}
            </div>
          ))}
        </div>
      )}

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
                  {(() => {
                    const status = displayExecutionStatus(exec.status, exec.has_unresolved_issues);
                    return <span className={`badge ${status.badgeClass}`}>{status.label}</span>;
                  })()}
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
