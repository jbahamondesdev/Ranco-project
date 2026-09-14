import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, CheckCircle2, Download, ExternalLink, Pencil, RefreshCw, X } from "lucide-react";
import { getDocumentFileUrl } from "../../api/documents";
import { getExecutionExportUrl, useCreateExecution, useResolveMappedField } from "../../api/executions";
import { DATA_TYPE_ICON, DATA_TYPE_LABEL } from "../../utils/dataType";
import { useRole } from "../../state/role";
import { displayExecutionStatus, hasUnresolvedIssues } from "../../workflow/executionStatus";
import type { NodeId } from "../../workflow/graph";
import type { ExecutionDetail, MappedField } from "../../api/types";
import { MappedFieldValue } from "./MappedFieldValue";

const FIELD_STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  needs_review: "Requiere revisión",
  missing: "Campo obligatorio ausente",
  warning: "Fuera de rango",
};

const TITLES: Record<NodeId, string> = {
  trigger: "1. Cargar documentos",
  documentType: "2. Tipo de documento",
  validation: "3. Validaciones",
  destination: "4. Destino",
};

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

export function NodeDetailPanel({
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
  const { role } = useRole();
  const navigate = useNavigate();
  const resolveMappedField = useResolveMappedField(execution.id);
  const createExecution = useCreateExecution();
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [destinationTab, setDestinationTab] = useState<"resumen" | "json">("resumen");

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

  const status = displayExecutionStatus(execution.status, hasUnresolvedIssues(execution));

  const retry = () => {
    createExecution.mutate(
      { documentId: execution.document_id, workflowId: execution.workflow_id ?? undefined },
      {
        onSuccess: (newExecution) => {
          if (execution.workflow_id) {
            navigate(`/workflows/${execution.workflow_id}/ejecuciones/${newExecution.id}`);
          }
        },
      }
    );
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
        <h3 style={{ margin: 0 }}>{TITLES[nodeId]}</h3>
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
            <a
              href={getDocumentFileUrl(execution.document_id)}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <ExternalLink size={13} /> Abrir documento original en una pestaña nueva
            </a>
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
              <span className={`badge ${status.badgeClass}`}>{status.label}</span>
              {execution.completed_at && (
                <p style={{ fontSize: 13, margin: "8px 0 0", color: "var(--text-muted)" }}>
                  Terminado: {new Date(execution.completed_at).toLocaleString()}
                </p>
              )}
              {execution.mapped_fields.length > 0 && (
                <a
                  href={getExecutionExportUrl(execution.id)}
                  className="btn"
                  style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                >
                  <Download size={13} /> Exportar CSV
                </a>
              )}
              {execution.status === "error" && execution.error_message && (
                <p style={{ fontSize: 13, marginTop: 8, color: "var(--danger)" }}>{execution.error_message}</p>
              )}
              {execution.status === "error" && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                  disabled={createExecution.isPending}
                  onClick={retry}
                >
                  <RefreshCw size={13} /> {createExecution.isPending ? "Reprocesando..." : "Reprocesar documento"}
                </button>
              )}
            </PanelSection>
          )}

          {destinationTab === "resumen" && execution.events.length > 0 && (
            <PanelSection title="Historial de eventos">
              <table>
                <thead>
                  <tr>
                    <th>Etapa</th>
                    <th>Estado</th>
                    <th>Mensaje</th>
                    <th>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {execution.events.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.stage}</td>
                      <td>
                        <span className={`badge ${ev.status === "error" ? "badge-danger" : ev.status === "retry" ? "badge-warning" : "badge-success"}`}>
                          {ev.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 220 }}>{ev.message ?? "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
