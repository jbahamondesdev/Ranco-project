import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ReactFlow, Background, Controls, useNodesState, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, CheckCircle2, Loader2, Play, Save } from "lucide-react";
import { useDocumentType, useDocumentTypes } from "../api/documentTypes";
import { useUploadDocument } from "../api/documents";
import { useCreateExecution } from "../api/executions";
import { useCreateWorkflow, useUpdateWorkflow, useWorkflow } from "../api/workflows";
import { extractErrorMessage } from "../api/errors";
import type { FieldDefinition, WorkflowFieldThreshold, WorkflowTriggerType } from "../api/types";
import {
  DestinationNode,
  DocumentTypeNode,
  TriggerNode,
  ValidationNode,
  type DestinationNodeType,
  type DocumentTypeNodeType,
  type TriggerNodeType,
  type TriggerRunStatus,
  type ValidationNodeType,
} from "../components/workflow/nodes";
import { FIXED_EDGES, INITIAL_POSITIONS } from "../workflow/graph";
import { clearWorkflowLayout, loadWorkflowLayout, saveWorkflowLayout } from "../utils/workflowLayout";

const nodeTypes = {
  trigger: TriggerNode,
  documentType: DocumentTypeNode,
  validation: ValidationNode,
  destination: DestinationNode,
};

type FlowNode = TriggerNodeType | DocumentTypeNodeType | ValidationNodeType | DestinationNodeType;

export function WorkflowEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workflowId, setWorkflowId] = useState<string | undefined>(id);
  const { data: workflow } = useWorkflow(workflowId);
  const { data: allTypes } = useDocumentTypes();
  const publishedTypes = useMemo(() => allTypes?.filter((t) => t.status === "published") ?? [], [allTypes]);

  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const uploadDocument = useUploadDocument();
  const createExecution = useCreateExecution();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [documentTypeId, setDocumentTypeId] = useState<string | null>(null);
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("manual");
  const [fieldThresholds, setFieldThresholds] = useState<Record<string, WorkflowFieldThreshold>>({});
  const [saved, setSaved] = useState(false);
  const prefilledRef = useRef(false);

  const { data: selectedDocType } = useDocumentType(documentTypeId ?? undefined);
  // Los umbrales min/max solo tienen sentido sobre valores numéricos, así que se
  // filtran los campos (y, dentro de una tabla, las columnas) a solo tipo "numero".
  const documentTypeFields: FieldDefinition[] = useMemo(() => {
    if (!selectedDocType) return [];
    const published = [...selectedDocType.versions]
      .filter((v) => v.status === "published")
      .sort((a, b) => b.version_number - a.version_number)[0];
    const allFields = published?.fields_schema ?? [];

    const numericFields: FieldDefinition[] = [];
    for (const f of allFields) {
      if (f.data_type === "numero") {
        numericFields.push(f);
      } else if (f.data_type === "tabla") {
        const numericColumns = (f.columns ?? []).filter((c) => c.data_type === "numero");
        if (numericColumns.length > 0) numericFields.push({ ...f, columns: numericColumns });
      }
    }
    return numericFields;
  }, [selectedDocType]);

  const [stagedFile, setStagedFile] = useState<File>();
  const [runStatus, setRunStatus] = useState<TriggerRunStatus>("idle");
  const [runError, setRunError] = useState<string>();
  const [lastExecutionId, setLastExecutionId] = useState<string>();

  useEffect(() => {
    if (!workflow || prefilledRef.current) return;
    prefilledRef.current = true;
    setName(workflow.name);
    setDocumentTypeId(workflow.document_type_id);
    setTriggerType(workflow.trigger_type);
    setFieldThresholds(workflow.field_thresholds);
  }, [workflow]);

  const layoutKey = workflowId ?? "draft";
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({ ...INITIAL_POSITIONS });

  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<FlowNode>([
    {
      id: "trigger",
      type: "trigger",
      position: INITIAL_POSITIONS.trigger,
      data: {
        triggerType: "manual",
        onTriggerTypeChange: () => {},
        canRun: false,
        onFileSelected: () => {},
        stagedFileName: null,
        runStatus: "idle",
      },
    },
    {
      id: "documentType",
      type: "documentType",
      position: INITIAL_POSITIONS.documentType,
      data: { documentTypeId: null, documentTypes: [], onChange: () => {} },
    },
    {
      id: "validation",
      type: "validation",
      position: INITIAL_POSITIONS.validation,
      data: { hasDocumentType: false, fields: [], thresholds: {}, onToggleField: () => {}, onChange: () => {} },
    },
    { id: "destination", type: "destination", position: INITIAL_POSITIONS.destination, data: {} },
  ]);

  // Carga la disposición guardada en este navegador para este flujo (si existe).
  useEffect(() => {
    const stored = loadWorkflowLayout(layoutKey);
    if (!stored) return;
    positionsRef.current = { ...positionsRef.current, ...stored };
    setNodes((nds) => nds.map((n) => (stored[n.id] ? { ...n, position: stored[n.id] } : n)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Guarda la disposición al terminar de arrastrar un nodo (no en cada frame del drag).
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      onNodesChangeRaw(changes);
      let dragEnded = false;
      for (const c of changes) {
        if (c.type === "position") {
          if (c.position) positionsRef.current[c.id] = c.position;
          if (c.dragging === false) dragEnded = true;
        }
      }
      if (dragEnded) saveWorkflowLayout(layoutKey, positionsRef.current);
    },
    [onNodesChangeRaw, layoutKey]
  );

  const isSaving = createWorkflow.isPending || updateWorkflow.isPending;

  // Elegir/soltar un archivo y armar la config ya no requiere haber guardado antes —
  // solo un flujo pausado bloquea probarlo.
  const canRun = workflow?.status !== "paused";
  const disabledReason = workflow?.status === "paused" ? "El flujo está pausado — reanúdalo para poder probarlo." : undefined;

  // Seleccionar un archivo solo lo deja listo — no ejecuta nada todavía. `setStagedFile`
  // es estable (viene de useState), así que este callback puede tener deps vacías sin
  // necesitar el truco de ref que sí hace falta para handleRunClick más abajo.
  const handleFileSelected = useCallback((file: File) => {
    setStagedFile(file);
    setRunStatus("idle");
    setRunError(undefined);
    setLastExecutionId(undefined);
  }, []);

  // Guarda el flujo con la config actual (creándolo si aún no existe) y devuelve su id.
  // Si falta el nombre, marca el error inline y devuelve undefined sin guardar nada.
  const ensureSaved = async (): Promise<string | undefined> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return undefined;
    }
    setNameError(false);

    const currentKeys = new Set<string>();
    for (const f of documentTypeFields) {
      currentKeys.add(f.name);
      if (f.data_type === "tabla" && f.columns) {
        for (const c of f.columns) currentKeys.add(`${f.name}.${c.name}`);
      }
    }
    const cleanedThresholds: Record<string, WorkflowFieldThreshold> = {};
    for (const [key, t] of Object.entries(fieldThresholds)) {
      if (currentKeys.has(key)) cleanedThresholds[key] = t;
    }

    const payload = {
      name: trimmedName,
      document_type_id: documentTypeId,
      destination: "internal_db" as const,
      trigger_type: triggerType,
      field_thresholds: cleanedThresholds,
    };

    let id = workflowId;
    if (id === undefined) {
      const created = await createWorkflow.mutateAsync(payload);
      const draftLayout = loadWorkflowLayout("draft");
      if (draftLayout) {
        saveWorkflowLayout(created.id, draftLayout);
        clearWorkflowLayout("draft");
      }
      id = created.id;
      setWorkflowId(id);
      navigate(`/workflows/${id}`, { replace: true });
    } else {
      await updateWorkflow.mutateAsync({ workflowId: id, ...payload });
    }
    setSaved(true);
    return id;
  };

  const handleSave = async () => {
    await ensureSaved();
  };

  // Ejecutar: guarda el flujo con la config actual (pidiendo el nombre si falta), sube
  // el documento elegido, crea la ejecución, y navega directo a ver el resultado.
  const handleRunClick = async () => {
    if (!stagedFile) return;
    setRunStatus("running");
    setRunError(undefined);
    try {
      const id = await ensureSaved();
      if (id === undefined) {
        setRunStatus("idle");
        return;
      }
      const doc = await uploadDocument.mutateAsync(stagedFile);
      const execution = await createExecution.mutateAsync({ documentId: doc.id, workflowId: id });
      navigate(`/workflows/${id}/ejecuciones/${execution.id}`);
    } catch (err) {
      setRunStatus("error");
      setRunError(extractErrorMessage(err, "No se pudo ejecutar el flujo."));
    }
  };

  // Actualiza solo los datos de cada nodo (sin tocar su posición) cuando cambia
  // la config, para que arrastrar un nodo en el canvas no se resetee.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n): FlowNode => {
        if (n.type === "trigger") {
          return {
            ...n,
            data: {
              triggerType,
              onTriggerTypeChange: (t: WorkflowTriggerType) => {
                setTriggerType(t);
                setSaved(false);
              },
              canRun,
              disabledReason,
              onFileSelected: handleFileSelected,
              stagedFileName: stagedFile?.name ?? null,
              runStatus,
              runError,
              lastExecutionId,
            },
          };
        }
        if (n.type === "documentType") {
          return {
            ...n,
            data: {
              documentTypeId,
              documentTypes: publishedTypes,
              onChange: (docTypeId: string | null) => {
                setDocumentTypeId(docTypeId);
                setSaved(false);
              },
            },
          };
        }
        if (n.type === "validation") {
          return {
            ...n,
            data: {
              hasDocumentType: documentTypeId !== null,
              fields: documentTypeFields,
              thresholds: fieldThresholds,
              onToggleField: (fieldName: string, enabled: boolean) => {
                setFieldThresholds((prev) => {
                  if (enabled) return { ...prev, [fieldName]: prev[fieldName] ?? { min: null, max: null } };
                  const next = { ...prev };
                  delete next[fieldName];
                  return next;
                });
                setSaved(false);
              },
              onChange: (fieldName: string, patch: Partial<WorkflowFieldThreshold>) => {
                setFieldThresholds((prev) => {
                  const existing = prev[fieldName] ?? { min: null, max: null };
                  return { ...prev, [fieldName]: { ...existing, ...patch } };
                });
                setSaved(false);
              },
            },
          };
        }
        return n;
      })
    );
  }, [
    documentTypeId,
    publishedTypes,
    triggerType,
    canRun,
    disabledReason,
    handleFileSelected,
    stagedFile,
    runStatus,
    runError,
    lastExecutionId,
    documentTypeFields,
    fieldThresholds,
    setNodes,
  ]);

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

        <div style={{ justifySelf: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
              setSaved(false);
            }}
            placeholder="Nombre del flujo *"
            style={{
              fontSize: 15,
              fontWeight: 600,
              textAlign: "center",
              border: `1px solid ${nameError ? "var(--danger)" : "var(--border)"}`,
              borderRadius: 8,
              padding: "7px 14px",
              background: "var(--surface)",
              width: 340,
            }}
          />
          {nameError && (
            <span style={{ color: "var(--danger)", fontSize: 11, marginTop: 3 }}>El nombre es obligatorio.</span>
          )}
        </div>

        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
          {saved && (
            <span className="badge badge-success">
              <CheckCircle2 size={13} /> Guardado
            </span>
          )}
          <button
            className="btn"
            onClick={handleRunClick}
            disabled={!canRun || !stagedFile || runStatus === "running"}
            title={!stagedFile ? "Elige un archivo en el nodo \"Cargar documentos\" primero" : undefined}
          >
            {runStatus === "running" ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            {runStatus === "running" ? "Ejecutando..." : "Ejecutar"}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={FIXED_EDGES}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.3 }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
