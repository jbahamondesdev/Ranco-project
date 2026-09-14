import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Database, FileCheck2, FileText, Loader2, Play, Save, UploadCloud } from "lucide-react";
import { useDocumentType, useDocumentTypes } from "../api/documentTypes";
import { useUploadDocument } from "../api/documents";
import { useCreateExecution } from "../api/executions";
import { useCreateWorkflow, useUpdateWorkflow, useWorkflow } from "../api/workflows";
import { extractErrorMessage } from "../api/errors";
import { isNumericDataType } from "../utils/dataType";
import type { FieldDefinition, WorkflowDestination, WorkflowFieldThreshold, WorkflowTriggerType } from "../api/types";
import type { TriggerRunStatus, Tone } from "../components/workflow/nodes";
import { EditorStepNode } from "../components/workflow/EditorStepNode";
import { WorkflowStepPanel } from "../components/workflow/WorkflowStepPanel";
import { WorkflowStepper } from "../components/workflow/WorkflowStepper";
import { OrientationToggle } from "../components/workflow/OrientationToggle";
import { useWorkflowOrientation } from "../hooks/useWorkflowOrientation";
import { useResizableSplit } from "../hooks/useResizableSplit";
import type { NodeId } from "../workflow/graph";

const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 760;
const PANEL_DEFAULT_WIDTH = 460;

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
  const [destination, setDestination] = useState<WorkflowDestination>("internal_db");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [fieldThresholds, setFieldThresholds] = useState<Record<string, WorkflowFieldThreshold>>({});
  const [saved, setSaved] = useState(false);
  const [orientation, setOrientation] = useWorkflowOrientation();
  const [selectedStep, setSelectedStep] = useState<NodeId>();
  const {
    size: panelWidth,
    isDragging: isResizingPanel,
    containerRef: splitRef,
    onPointerDown: handleResizePointerDown,
    onPointerMove: handleResizePointerMove,
    onPointerUp: handleResizePointerUp,
  } = useResizableSplit({ mode: "pixels", initial: PANEL_DEFAULT_WIDTH, min: PANEL_MIN_WIDTH, max: PANEL_MAX_WIDTH });
  const prefilledRef = useRef(false);

  const { data: selectedDocType } = useDocumentType(documentTypeId ?? undefined);
  // Los umbrales min/max solo tienen sentido sobre valores numéricos (incluye
  // porcentaje, que tambien se guarda como numero plano - ver mapping.py), asi que
  // se filtran los campos (y, dentro de una tabla, las columnas) a esos tipos.
  const documentTypeFields: FieldDefinition[] = useMemo(() => {
    if (!selectedDocType) return [];
    const published = [...selectedDocType.versions]
      .filter((v) => v.status === "published")
      .sort((a, b) => b.version_number - a.version_number)[0];
    const allFields = published?.fields_schema ?? [];

    const numericFields: FieldDefinition[] = [];
    for (const f of allFields) {
      if (isNumericDataType(f.data_type)) {
        numericFields.push(f);
      } else if (f.data_type === "tabla") {
        const numericColumns = (f.columns ?? []).filter((c) => isNumericDataType(c.data_type));
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
    setDestination(workflow.destination);
    setWebhookUrl(workflow.destination_config?.url ?? "");
    setFieldThresholds(workflow.field_thresholds);
  }, [workflow]);

  const isSaving = createWorkflow.isPending || updateWorkflow.isPending;

  // Elegir/soltar un archivo y armar la config ya no requiere haber guardado antes —
  // solo un flujo pausado bloquea probarlo.
  const canRun = workflow?.status !== "paused";
  const disabledReason = workflow?.status === "paused" ? "El flujo está pausado — reanúdalo para poder probarlo." : undefined;

  // Seleccionar un archivo solo lo deja listo — no ejecuta nada todavía.
  const handleFileSelected = (file: File) => {
    setStagedFile(file);
    setRunStatus("idle");
    setRunError(undefined);
    setLastExecutionId(undefined);
  };

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
      destination,
      destination_config: destination === "webhook" ? { url: webhookUrl.trim() } : null,
      trigger_type: triggerType,
      field_thresholds: cleanedThresholds,
    };

    let id = workflowId;
    if (id === undefined) {
      const created = await createWorkflow.mutateAsync(payload);
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

  // resumen compacto + estado "configurado" de cada paso, para las tarjetas del
  // stepper - los campos reales se editan en el panel lateral (ver WorkflowStepPanel)
  const activeThresholdCount = Object.keys(fieldThresholds).length;
  const stepDefs: { id: NodeId; icon: React.ReactNode; tone: Tone; step: number; title: string; summary: string; complete: boolean }[] = [
    {
      id: "trigger",
      icon: <UploadCloud size={15} />,
      tone: "primary",
      step: 1,
      title: "Cargar documentos",
      summary: stagedFile ? `Archivo listo: ${stagedFile.name}` : "Sin archivo cargado todavía",
      complete: stagedFile != null,
    },
    {
      id: "documentType",
      icon: <FileText size={15} />,
      tone: "accent",
      step: 2,
      title: "Tipo de documento",
      summary: selectedDocType ? selectedDocType.name : "Sin tipo seleccionado",
      complete: documentTypeId !== null,
    },
    {
      id: "validation",
      icon: <FileCheck2 size={15} />,
      tone: "warning",
      step: 3,
      title: "Validaciones",
      summary: activeThresholdCount > 0 ? `${activeThresholdCount} campo(s) con umbral` : "Sin umbrales configurados",
      complete: true,
    },
    {
      id: "destination",
      icon: <Database size={15} />,
      tone: "success",
      step: 4,
      title: "Destino",
      summary:
        destination === "internal_db"
          ? "Base de datos interna"
          : webhookUrl.trim()
            ? `Webhook: ${webhookUrl}`
            : "Falta la URL del webhook",
      complete: destination === "internal_db" || webhookUrl.trim() !== "",
    },
  ];

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
          <OrientationToggle value={orientation} onChange={setOrientation} />
          <button
            className="btn"
            onClick={handleRunClick}
            disabled={!canRun || !stagedFile || runStatus === "running"}
            title={!stagedFile ? "Elige un archivo en el paso \"Cargar documentos\" primero" : undefined}
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

      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <WorkflowStepper orientation={orientation}>
            {stepDefs.map((d) => (
              <EditorStepNode
                key={d.id}
                data={{
                  icon: d.icon,
                  tone: d.tone,
                  step: d.step,
                  title: d.title,
                  summary: d.summary,
                  complete: d.complete,
                  selected: selectedStep === d.id,
                  onSelect: () => setSelectedStep(d.id),
                }}
              />
            ))}
          </WorkflowStepper>
        </div>

        {selectedStep && (
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
            <WorkflowStepPanel
              key={selectedStep}
              nodeId={selectedStep}
              onClose={() => setSelectedStep(undefined)}
              width={panelWidth}
              triggerData={{
                triggerType,
                onTriggerTypeChange: (t) => {
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
              }}
              documentTypeData={{
                documentTypeId,
                documentTypes: publishedTypes,
                onChange: (docTypeId) => {
                  setDocumentTypeId(docTypeId);
                  setSaved(false);
                },
              }}
              validationData={{
                hasDocumentType: documentTypeId !== null,
                fields: documentTypeFields,
                thresholds: fieldThresholds,
                onToggleField: (fieldName, enabled) => {
                  setFieldThresholds((prev) => {
                    if (enabled) return { ...prev, [fieldName]: prev[fieldName] ?? { min: null, max: null } };
                    const next = { ...prev };
                    delete next[fieldName];
                    return next;
                  });
                  setSaved(false);
                },
                onChange: (fieldName, patch) => {
                  setFieldThresholds((prev) => {
                    const existing = prev[fieldName] ?? { min: null, max: null };
                    return { ...prev, [fieldName]: { ...existing, ...patch } };
                  });
                  setSaved(false);
                },
              }}
              destinationData={{
                destination,
                webhookUrl,
                onChange: (nextDestination, nextWebhookUrl) => {
                  setDestination(nextDestination);
                  setWebhookUrl(nextWebhookUrl);
                  setSaved(false);
                },
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
