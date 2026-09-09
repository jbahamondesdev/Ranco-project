import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ReactFlow, Background, Controls, MarkerType, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileCheck2,
  FileText,
  Hash,
  Pencil,
  ToggleLeft,
  Type,
  UploadCloud,
  X,
} from "lucide-react";
import { TERMINAL_STATUSES, useExecution, useMarkExecutionSeen, useResolveMappedField } from "../api/executions";
import { useWorkflow } from "../api/workflows";
import { useDocument, getDocumentFileUrl } from "../api/documents";
import { guessPreviewKind } from "../utils/documentPreview";
import { loadWorkflowLayout } from "../utils/workflowLayout";
import { MappedFieldValue } from "../components/pipeline/MappedFieldValue";
import { Spinner } from "../components/common/Spinner";
import { useRole } from "../state/role";
import {
  ExecutionStepNode,
  type ExecutionNodeStatus,
  type ExecutionStepNodeType,
} from "../components/workflow/ExecutionStepNode";
import type { DataType, ExecutionDetail, ExecutionEvent, ExecutionStatus, MappedField } from "../api/types";

const nodeTypes = { executionStep: ExecutionStepNode };

const EDGE_STYLE = { stroke: "var(--text-muted)", strokeWidth: 2 };
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: "var(--text-muted)", width: 18, height: 18 };

const FIXED_EDGES: Edge[] = [
  { id: "e1-2", source: "trigger", target: "documentType", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e2-3", source: "documentType", target: "validation", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e3-4", source: "validation", target: "destination", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
];

const INITIAL_POSITIONS: Record<string, { x: number; y: number }> = {
  trigger: { x: 20, y: 60 },
  documentType: { x: 320, y: 40 },
  validation: { x: 620, y: 40 },
  destination: { x: 920, y: 60 },
};

const NODE_ORDER = ["trigger", "documentType", "validation", "destination"] as const;
type NodeId = (typeof NODE_ORDER)[number];

// El nodo 1 (Cargar documentos) es exclusivamente sobre subir/almacenar el archivo,
// algo que ya ocurrió de forma sincrónica antes de que exista la Execution — por eso
// nunca aparece como "activo" ni "con error" acá: la extracción (OCR) y el mapeo son
// responsabilidad del nodo 2 (Tipo de documento).
const STATUS_TO_ACTIVE_NODE: Partial<Record<ExecutionStatus, NodeId>> = {
  pending: "documentType",
  extracting: "documentType",
  mapping: "documentType",
  validating: "validation",
  needs_review: "destination",
  completed: "destination",
};

// a que nodo pertenece cada stage de ExecutionEvent (misma idea que PipelineStepper)
const STAGE_TO_NODE: Record<string, NodeId> = {
  extraction: "documentType",
  mapping: "documentType",
  validation: "validation",
};

function getFailedNode(events: ExecutionEvent[]): NodeId {
  for (let i = events.length - 1; i >= 0; i--) {
    const node = STAGE_TO_NODE[events[i].stage];
    if (node) return node;
  }
  return "documentType";
}

// estados de MappedField que representan "algo que vale la pena que alguien revise" —
// debe calzar con ISSUE_STATUSES del backend (app/routers/executions.py)
const ISSUE_STATUSES = new Set(["needs_review", "missing", "warning"]);

// una vez que un campo se corrige o se descarta desde el panel de Validaciones
// (resolved=true) deja de contar como problema pendiente, aunque su "status" original
// siga guardado para dejar rastro de que hubo un problema y cómo se resolvió
export function hasUnresolvedIssues(execution: ExecutionDetail): boolean {
  return execution.mapped_fields.some((f) => ISSUE_STATUSES.has(f.status) && !f.resolved);
}

function computeNodeStatuses(execution: ExecutionDetail): Record<NodeId, ExecutionNodeStatus> {
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

  const activeNode = STATUS_TO_ACTIVE_NODE[execution.status] ?? "documentType";
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

function nodeSummary(nodeId: NodeId, execution: ExecutionDetail, status: ExecutionNodeStatus): string {
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

const DATA_TYPE_LABEL: Record<DataType, string> = {
  texto: "texto",
  numero: "número",
  fecha: "fecha",
  booleano: "booleano",
  tabla: "tabla",
};

const DATA_TYPE_ICON: Record<DataType, typeof Type> = {
  texto: Type,
  numero: Hash,
  fecha: Calendar,
  booleano: ToggleLeft,
  tabla: FileCheck2,
};

const FIELD_STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  needs_review: "Requiere revisión",
  missing: "Campo obligatorio ausente",
  warning: "Fuera de rango",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "badge-progress",
  extracting: "badge-progress",
  mapping: "badge-progress",
  validating: "badge-progress",
  needs_review: "badge-warning",
  completed: "badge-success",
  error: "badge-danger",
};

// el "status" de la ejecución queda fijo como rastro histórico (fue a needs_review por
// algún motivo), pero una vez que ya no quedan campos sin resolver conviene mostrarlo
// como resuelto en vez de seguir pareciendo un problema pendiente
function displayExecutionStatus(execution: ExecutionDetail): { label: string; badgeClass: string } {
  if (execution.status === "needs_review" && !hasUnresolvedIssues(execution)) {
    return { label: "resuelta", badgeClass: "badge-success" };
  }
  return { label: execution.status, badgeClass: STATUS_BADGE[execution.status] ?? "" };
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

function NodeDetailPanel({
  nodeId,
  execution,
  onClose,
  width,
}: {
  nodeId: NodeId;
  execution: ExecutionDetail;
  onClose: () => void;
  width: number;
}) {
  const titles: Record<NodeId, string> = {
    trigger: "1. Cargar documentos",
    documentType: "2. Tipo de documento",
    validation: "3. Validaciones",
    destination: "4. Destino",
  };

  const { role } = useRole();
  const resolveMappedField = useResolveMappedField(execution.id);
  const { data: sourceDocument } = useDocument(nodeId === "validation" ? execution.document_id : undefined);
  const [showDocument, setShowDocument] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [destinationTab, setDestinationTab] = useState<"resumen" | "json">("resumen");

  const previewKind = sourceDocument ? guessPreviewKind(sourceDocument.original_filename) : null;

  const startEdit = (field: MappedField) => {
    setEditingFieldId(field.id);
    setEditValue(field.corrected_value ?? field.value ?? "");
  };
  const cancelEdit = () => setEditingFieldId(null);
  const saveEdit = (fieldId: string) => {
    resolveMappedField.mutate({ fieldId, correctedValue: editValue, role });
    setEditingFieldId(null);
  };
  const dismiss = (fieldId: string) => {
    if (window.confirm("¿Descartar esta alerta sin modificar el valor extraído?")) {
      resolveMappedField.mutate({ fieldId, correctedValue: null, role });
    }
  };

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        padding: 24,
        overflow: "auto",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>{titles[nodeId]}</h3>
        <button className="icon-btn" onClick={onClose} title="Cerrar">
          <X size={16} />
        </button>
      </div>

      {nodeId === "trigger" && (
        <>
          <PanelSection title="Entrada">
            <p style={{ fontSize: 13, margin: 0 }}>Archivo: {execution.document_filename}</p>
            <p style={{ fontSize: 13, margin: "4px 0 0", color: "var(--text-muted)" }}>
              Inicio: {new Date(execution.started_at).toLocaleString()}
            </p>
          </PanelSection>
          <PanelSection title="Salida">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--success)",
              }}
            >
              <CheckCircle2 size={16} /> Documento recibido y almacenado correctamente
            </div>
          </PanelSection>
        </>
      )}

      {nodeId === "documentType" && (
        <>
          <PanelSection title="Entrada">
            <p style={{ fontSize: 13, margin: "0 0 8px" }}>
              Tipo: {execution.document_type_name} (v{execution.document_type_version_number})
            </p>
            <table>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Tipo</th>
                  <th>Obligatorio</th>
                </tr>
              </thead>
              <tbody>
                {execution.fields_schema.map((f) => {
                  const Icon = DATA_TYPE_ICON[f.data_type];
                  return (
                    <tr key={f.name}>
                      <td>{f.name}</td>
                      <td>
                        <Icon size={13} style={{ verticalAlign: "middle", marginRight: 4 }} color="var(--text-muted)" />
                        {DATA_TYPE_LABEL[f.data_type]}
                      </td>
                      <td>{f.required ? "Sí" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PanelSection>

          <PanelSection title="Texto extraído (OCR)">
            {execution.extraction_preview ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <span className="badge">{execution.extraction_preview.page_count} página(s)</span>
                  <span className="badge">{execution.extraction_preview.table_count} tabla(s)</span>
                  <span className="badge">{execution.extraction_preview.content_length} caracteres extraídos</span>
                </div>
                <details>
                  <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                    Ver texto extraído
                  </summary>
                  <pre
                    style={{
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 10,
                      marginTop: 8,
                      maxHeight: 220,
                      overflow: "auto",
                    }}
                  >
                    {execution.extraction_preview.content_preview || "(sin texto extraído)"}
                  </pre>
                </details>
              </>
            ) : execution.error_message ? (
              <p style={{ fontSize: 13, color: "var(--danger)" }}>{execution.error_message}</p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Aún no hay resultado.</p>
            )}
          </PanelSection>

          <PanelSection title="Salida — campos mapeados">
            {execution.mapped_fields.length === 0 ? (
              <p style={{ fontSize: 13, color: execution.extraction_preview && execution.error_message ? "var(--danger)" : "var(--text-muted)" }}>
                {execution.extraction_preview && execution.error_message
                  ? execution.error_message
                  : "Aún no hay resultado."}
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor</th>
                    <th>Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  {execution.mapped_fields.map((f) => (
                    <tr key={f.id}>
                      <td>{f.field_name}</td>
                      <td>
                        <MappedFieldValue field={f} />
                      </td>
                      <td>{f.confidence != null ? f.confidence.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PanelSection>
        </>
      )}

      {nodeId === "validation" && (
        <>
          <PanelSection title="Documento original">
            <button
              className="btn"
              style={{ fontSize: 12, marginBottom: showDocument ? 10 : 0, display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => setShowDocument((v) => !v)}
            >
              {showDocument ? <EyeOff size={13} /> : <Eye size={13} />}
              {showDocument ? "Ocultar documento" : "Ver documento original"}
            </button>
            {showDocument && (
              <>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {previewKind === "pdf" && (
                    <iframe
                      title="documento original"
                      src={getDocumentFileUrl(execution.document_id)}
                      style={{ width: "100%", height: 380, border: "none", display: "block" }}
                    />
                  )}
                  {previewKind === "image" && (
                    <img
                      src={getDocumentFileUrl(execution.document_id)}
                      alt="documento original"
                      style={{ width: "100%", objectFit: "contain", display: "block" }}
                    />
                  )}
                  {previewKind === "other" && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", padding: 12, margin: 0 }}>
                      No hay previsualización disponible para este formato ({execution.document_filename}).
                    </p>
                  )}
                  {!previewKind && <Spinner center size={20} />}
                </div>
                <a
                  href={getDocumentFileUrl(execution.document_id)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, marginTop: 8 }}
                >
                  <ExternalLink size={12} /> Abrir en una pestaña nueva
                </a>
              </>
            )}
          </PanelSection>

          <PanelSection title="Entrada">
            <p style={{ fontSize: 13, margin: 0 }}>
              Umbral de confianza usado:{" "}
              {execution.confidence_threshold_used != null ? execution.confidence_threshold_used.toFixed(2) : "—"}
            </p>
          </PanelSection>
          <PanelSection title="Salida">
            {execution.mapped_fields.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Aún no hay resultado.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor</th>
                    <th>Confianza</th>
                    <th>Estado</th>
                    <th>Motivo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {execution.mapped_fields.map((f) => {
                    const isIssue = f.status !== "ok";
                    const editing = editingFieldId === f.id;
                    return (
                      <tr key={f.id}>
                        <td>{f.field_name}</td>
                        <td>
                          {editing ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              style={{ width: "100%", fontSize: 13, padding: "4px 6px" }}
                              autoFocus
                            />
                          ) : (
                            <MappedFieldValue field={{ data_type: f.data_type, value: f.corrected_value ?? f.value }} />
                          )}
                          {!editing && f.resolved && f.corrected_value != null && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>original: {f.value ?? "—"}</div>
                          )}
                        </td>
                        <td>{f.confidence != null ? f.confidence.toFixed(2) : "—"}</td>
                        <td>
                          <span className={`badge ${f.status === "ok" ? "badge-success" : "badge-warning"}`}>
                            {FIELD_STATUS_LABEL[f.status] ?? f.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 180 }}>{f.reason ?? "—"}</td>
                        <td>
                          {!isIssue ? (
                            "—"
                          ) : f.resolved ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 12,
                                color: "var(--success)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <CheckCircle2 size={13} /> Resuelto
                            </span>
                          ) : editing ? (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                className="btn btn-primary"
                                style={{ padding: "4px 8px", fontSize: 12 }}
                                onClick={() => saveEdit(f.id)}
                              >
                                Guardar
                              </button>
                              <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={cancelEdit}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 4 }}>
                              {f.data_type !== "tabla" && (
                                <button
                                  className="btn"
                                  style={{ padding: "4px 8px" }}
                                  title="Corregir valor"
                                  onClick={() => startEdit(f)}
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                              <button
                                className="btn"
                                style={{ padding: "4px 8px" }}
                                title="Descartar alerta"
                                onClick={() => dismiss(f.id)}
                              >
                                <Ban size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </PanelSection>
        </>
      )}

      {nodeId === "destination" && (
        <>
          <PanelSection title="Entrada">
            <p style={{ fontSize: 13, margin: 0 }}>
              {execution.mapped_fields.filter((f) => f.status === "ok").length} de {execution.mapped_fields.length}{" "}
              campo(s) validados sin problemas
            </p>
          </PanelSection>

          <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
            {(["resumen", "json"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDestinationTab(tab)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: destinationTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
                  color: destinationTab === tab ? "var(--text)" : "var(--text-muted)",
                  fontWeight: destinationTab === tab ? 600 : 500,
                  fontSize: 13,
                  padding: "6px 4px",
                  marginRight: 14,
                  cursor: "pointer",
                }}
              >
                {tab === "resumen" ? "Resumen" : "JSON del modelo"}
              </button>
            ))}
          </div>

          {destinationTab === "resumen" && (
            <PanelSection title="Salida">
              <span className={`badge ${displayExecutionStatus(execution).badgeClass}`}>
                {displayExecutionStatus(execution).label}
              </span>
              {execution.completed_at && (
                <p style={{ fontSize: 13, margin: "8px 0 0", color: "var(--text-muted)" }}>
                  Terminado: {new Date(execution.completed_at).toLocaleString()}
                </p>
              )}
              {execution.status === "error" && execution.error_message && (
                <p style={{ fontSize: 13, marginTop: 8, color: "var(--danger)" }}>{execution.error_message}</p>
              )}
            </PanelSection>
          )}

          {destinationTab === "json" && (
            <PanelSection title="Respuesta cruda del modelo">
              {execution.model_response_json ? (
                <pre
                  style={{
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 10,
                    maxHeight: 460,
                    overflow: "auto",
                  }}
                >
                  {formatJson(execution.model_response_json)}
                </pre>
              ) : (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Aún no hay una respuesta del modelo guardada para esta ejecución.
                </p>
              )}
            </PanelSection>
          )}
        </>
      )}
    </div>
  );
}

const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 760;
const PANEL_DEFAULT_WIDTH = 460;

export function WorkflowExecutionPage() {
  const { workflowId, executionId } = useParams();
  const { data: workflow } = useWorkflow(workflowId);
  const { data: execution } = useExecution(executionId);
  const [selectedNode, setSelectedNode] = useState<NodeId>();
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const markSeen = useMarkExecutionSeen();
  // guarda para qué execution.id ya evaluamos el "primer dato recibido" — evita
  // re-evaluar en cada poll, pero se resetea naturalmente al navegar a otra ejecución
  // (la ruta no desmonta el componente al cambiar solo el parámetro)
  const seenCheckedForIdRef = useRef<string | null>(null);

  // solo marca "vista" si la ejecución YA estaba terminada la primera vez que llegan
  // los datos (abriste algo ya resuelto) — si la ves terminar en vivo (recién
  // disparada desde "Ejecutar"), no se marca sola: hay que volver a entrar después.
  useEffect(() => {
    if (!execution || seenCheckedForIdRef.current === execution.id) return;
    seenCheckedForIdRef.current = execution.id;
    if (!execution.seen && TERMINAL_STATUSES.includes(execution.status)) {
      markSeen.mutate(execution.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution]);

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsResizingPanel(true);
  };
  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingPanel || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const newWidth = rect.right - e.clientX;
    setPanelWidth(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, newWidth)));
  };
  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsResizingPanel(false);
  };

  const layout = useMemo(
    () => (workflowId ? loadWorkflowLayout(workflowId) : null) ?? INITIAL_POSITIONS,
    [workflowId]
  );

  const nodes: ExecutionStepNodeType[] = useMemo(() => {
    if (!execution) return [];
    const statuses = computeNodeStatuses(execution);
    const defs: { id: NodeId; icon: React.ReactNode; tone: "primary" | "accent" | "warning" | "success"; step: number; title: string; showTarget?: boolean; showSource?: boolean }[] = [
      { id: "trigger", icon: <UploadCloud size={15} />, tone: "primary", step: 1, title: "Cargar documentos", showTarget: false },
      { id: "documentType", icon: <FileText size={15} />, tone: "accent", step: 2, title: "Tipo de documento" },
      { id: "validation", icon: <FileCheck2 size={15} />, tone: "warning", step: 3, title: "Validaciones" },
      { id: "destination", icon: <Database size={15} />, tone: "success", step: 4, title: "Destino", showSource: false },
    ];

    return defs.map((d) => ({
      id: d.id,
      type: "executionStep",
      position: layout[d.id] ?? INITIAL_POSITIONS[d.id],
      data: {
        icon: d.icon,
        tone: d.tone,
        step: d.step,
        title: d.title,
        showTarget: d.showTarget,
        showSource: d.showSource,
        status: statuses[d.id],
        summary: nodeSummary(d.id, execution, statuses[d.id]),
        selected: selectedNode === d.id,
        onSelect: () => setSelectedNode(d.id),
      },
    }));
  }, [execution, layout, selectedNode]);

  if (!execution) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "10px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          gap: 16,
        }}
      >
        <Link
          to="/workflows"
          style={{
            justifySelf: "start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-muted)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <ArrowLeft size={16} /> Workflows
        </Link>

        <div style={{ justifySelf: "center", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {workflow?.name ?? "Flujo"} — Ejecución {execution.id}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Inicio: {new Date(execution.started_at).toLocaleString()}
          </div>
        </div>

        <div style={{ justifySelf: "end" }}>
          <span className={`badge ${displayExecutionStatus(execution).badgeClass}`}>
            {displayExecutionStatus(execution).label}
          </span>
        </div>
      </div>

      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={FIXED_EDGES}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            fitViewOptions={{ padding: 0.3 }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <>
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
              title="Arrastra para ajustar el ancho del panel"
              style={{
                width: 6,
                flexShrink: 0,
                cursor: "col-resize",
                background: isResizingPanel ? "var(--primary)" : "var(--border)",
                touchAction: "none",
              }}
            />
            <NodeDetailPanel
              key={selectedNode}
              nodeId={selectedNode}
              execution={execution}
              onClose={() => setSelectedNode(undefined)}
              width={panelWidth}
            />
          </>
        )}
      </div>
    </div>
  );
}
