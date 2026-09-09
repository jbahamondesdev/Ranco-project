import { useRef, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Calendar,
  CheckCircle2,
  Database,
  FileCheck2,
  FileText,
  Hash,
  Loader2,
  ToggleLeft,
  Type,
  UploadCloud,
} from "lucide-react";
import type {
  DataType,
  DocumentType,
  FieldDefinition,
  WorkflowFieldThreshold,
  WorkflowTriggerType,
} from "../../api/types";

const NODE_WIDTH = 240;

export type Tone = "primary" | "accent" | "warning" | "success";

const TONE_COLORS: Record<Tone, { color: string; bg: string }> = {
  primary: { color: "var(--primary)", bg: "var(--primary-bg)" },
  accent: { color: "var(--accent)", bg: "var(--accent-bg)" },
  warning: { color: "var(--warning)", bg: "var(--warning-bg)" },
  success: { color: "var(--success)", bg: "var(--success-bg)" },
};

function handleStyle(color: string): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    background: color,
    border: "2px solid var(--surface)",
    boxShadow: "0 0 0 1px " + color,
  };
}

export function NodeShell({
  icon,
  tone,
  step,
  title,
  children,
  showTarget = true,
  showSource = true,
  cursor = "grab",
}: {
  icon: React.ReactNode;
  tone: Tone;
  step: number;
  title: string;
  children: React.ReactNode;
  showTarget?: boolean;
  showSource?: boolean;
  cursor?: string;
}) {
  const { color, bg } = TONE_COLORS[tone];
  return (
    <div
      style={{
        width: NODE_WIDTH,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        cursor,
      }}
    >
      {showTarget && <Handle type="target" position={Position.Left} style={handleStyle(color)} />}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            flexShrink: 0,
            borderRadius: 9,
            background: bg,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Paso {step}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{title}</div>
        </div>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>{children}</div>
      {showSource && <Handle type="source" position={Position.Right} style={handleStyle(color)} />}
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 5,
};

const fieldControlStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 12.5,
  padding: "6px 8px",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--bg)",
};

// --- 1. Disparo: cargar documentos ---
export type TriggerRunStatus = "idle" | "running" | "done" | "error";

export interface TriggerNodeData extends Record<string, unknown> {
  triggerType: WorkflowTriggerType;
  onTriggerTypeChange: (t: WorkflowTriggerType) => void;
  canRun: boolean;
  disabledReason?: string;
  onFileSelected: (file: File) => void;
  stagedFileName: string | null;
  runStatus: TriggerRunStatus;
  runError?: string;
  lastExecutionId?: string;
}
export type TriggerNodeType = Node<TriggerNodeData, "trigger">;

export function TriggerNode({ data }: NodeProps<TriggerNodeType>) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const active = data.canRun && data.runStatus !== "running";

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && active) data.onFileSelected(file);
  };

  return (
    <NodeShell icon={<UploadCloud size={15} />} tone="primary" step={1} title="Cargar documentos" showTarget={false}>
      <label style={fieldLabelStyle}>Origen de los documentos</label>
      <select
        className="nodrag"
        value={data.triggerType}
        onChange={(e) => data.onTriggerTypeChange(e.target.value as WorkflowTriggerType)}
        style={{ ...fieldControlStyle, marginBottom: 10 }}
      >
        <option value="manual">Subir documento</option>
        <option value="repository_polling" disabled>
          Repositorio conectado (próximamente)
        </option>
      </select>

      {data.triggerType === "repository_polling" && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
          La conexión automática a un repositorio (por ejemplo, SharePoint) estará disponible
          próximamente. Por ahora, los documentos se cargan de forma manual.
        </p>
      )}

      {data.triggerType === "manual" && (
        <>
          {data.disabledReason && (
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--warning)" }}>{data.disabledReason}</p>
          )}
          <div
            className="nodrag"
            onClick={() => active && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (active) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            style={{
              border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
              borderRadius: 10,
              padding: "18px 12px",
              textAlign: "center",
              background: dragOver ? "var(--primary-bg)" : "var(--bg)",
              cursor: active ? "pointer" : "default",
              opacity: active ? 1 : 0.6,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            {data.runStatus === "running" ? (
              <Loader2 size={18} className="spin" color="var(--primary)" />
            ) : data.stagedFileName ? (
              <CheckCircle2 size={18} color="var(--success)" />
            ) : (
              <UploadCloud size={18} color={dragOver ? "var(--primary)" : "var(--text-muted)"} />
            )}
            <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              {data.runStatus === "running"
                ? "Procesando documento..."
                : data.stagedFileName
                  ? `Archivo listo: ${data.stagedFileName}`
                  : "Arrastra tu documento aquí"}
            </p>
            {data.runStatus !== "running" && (
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                {data.stagedFileName
                  ? "haz clic para cambiarlo — usa \"Ejecutar\" arriba para correrlo"
                  : "o haz clic para seleccionarlo desde tu equipo"}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {data.runStatus === "done" && data.lastExecutionId !== undefined && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={12} /> Documento recibido — ejecución {data.lastExecutionId} en curso
            </p>
          )}
          {data.runStatus === "error" && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--danger)" }}>{data.runError}</p>
          )}
        </>
      )}
    </NodeShell>
  );
}

// --- 2. Tipo de documento ---
export interface DocumentTypeNodeData extends Record<string, unknown> {
  documentTypeId: string | null;
  documentTypes: DocumentType[];
  onChange: (id: string | null) => void;
}
export type DocumentTypeNodeType = Node<DocumentTypeNodeData, "documentType">;

export function DocumentTypeNode({ data }: NodeProps<DocumentTypeNodeType>) {
  return (
    <NodeShell icon={<FileText size={15} />} tone="accent" step={2} title="Tipo de documento">
      <label style={fieldLabelStyle}>Qué extraer</label>
      <select
        className="nodrag"
        value={data.documentTypeId ?? ""}
        onChange={(e) => data.onChange(e.target.value || null)}
        style={fieldControlStyle}
      >
        <option value="">Selecciona un tipo...</option>
        {data.documentTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </NodeShell>
  );
}

// --- 3. Validaciones ---
const VALIDATION_TYPE_ICON: Record<DataType, typeof Type> = {
  texto: Type,
  numero: Hash,
  fecha: Calendar,
  booleano: ToggleLeft,
  tabla: FileCheck2,
};

export interface ValidationNodeData extends Record<string, unknown> {
  hasDocumentType: boolean;
  fields: FieldDefinition[];
  thresholds: Record<string, WorkflowFieldThreshold>;
  onToggleField: (key: string, enabled: boolean) => void;
  onChange: (key: string, patch: Partial<WorkflowFieldThreshold>) => void;
}
export type ValidationNodeType = Node<ValidationNodeData, "validation">;

function FieldThresholdRow({
  field,
  thresholdKey,
  thresholds,
  onToggleField,
  onChange,
  nested = false,
}: {
  field: FieldDefinition;
  thresholdKey: string;
  thresholds: Record<string, WorkflowFieldThreshold>;
  onToggleField: (key: string, enabled: boolean) => void;
  onChange: (key: string, patch: Partial<WorkflowFieldThreshold>) => void;
  nested?: boolean;
}) {
  const Icon = VALIDATION_TYPE_ICON[field.data_type];
  const isTable = field.data_type === "tabla";
  const checked = !isTable && thresholdKey in thresholds;
  const threshold = thresholds[thresholdKey] ?? { min: null, max: null };

  return (
    <div style={{ padding: "6px 0", borderBottom: nested ? "none" : "1px solid var(--border)" }}>
      <label
        className="nodrag"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11.5,
          cursor: isTable ? "default" : "pointer",
        }}
      >
        {!isTable && (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggleField(thresholdKey, e.target.checked)}
          />
        )}
        <Icon size={12} color="var(--text-muted)" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field.name}</span>
      </label>

      {checked && (
        <div className="nodrag" style={{ display: "flex", gap: 6, marginTop: 5, marginLeft: 18 }}>
          <input
            type="number"
            placeholder="Mín"
            value={threshold.min ?? ""}
            onChange={(e) => onChange(thresholdKey, { min: e.target.value || null })}
            style={{ ...fieldControlStyle, padding: "4px 6px", fontSize: 11.5 }}
          />
          <input
            type="number"
            placeholder="Máx"
            value={threshold.max ?? ""}
            onChange={(e) => onChange(thresholdKey, { max: e.target.value || null })}
            style={{ ...fieldControlStyle, padding: "4px 6px", fontSize: 11.5 }}
          />
        </div>
      )}

      {isTable && field.columns && field.columns.length > 0 && (
        <div style={{ marginTop: 4, marginLeft: 15, borderLeft: "2px solid var(--border)", paddingLeft: 8 }}>
          {field.columns.map((col) => (
            <FieldThresholdRow
              key={col.name}
              field={col}
              thresholdKey={`${thresholdKey}.${col.name}`}
              thresholds={thresholds}
              onToggleField={onToggleField}
              onChange={onChange}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ValidationNode({ data }: NodeProps<ValidationNodeType>) {
  return (
    <NodeShell icon={<FileCheck2 size={15} />} tone="warning" step={3} title="Validaciones">
      {data.fields.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
          {data.hasDocumentType
            ? "Este tipo de documento no tiene campos numéricos para definir umbrales."
            : "Selecciona un tipo de documento en el paso 2 para configurar qué campos validar."}
        </p>
      ) : (
        <div style={{ maxHeight: 260, overflow: "auto" }}>
          {data.fields.map((f) => (
            <FieldThresholdRow
              key={f.name}
              field={f}
              thresholdKey={f.name}
              thresholds={data.thresholds}
              onToggleField={data.onToggleField}
              onChange={data.onChange}
            />
          ))}
        </div>
      )}
    </NodeShell>
  );
}

// --- 4. Destino ---
export interface DestinationNodeData extends Record<string, unknown> {}
export type DestinationNodeType = Node<DestinationNodeData, "destination">;

export function DestinationNode(_props: NodeProps<DestinationNodeType>) {
  return (
    <NodeShell icon={<Database size={15} />} tone="success" step={4} title="Destino" showSource={false}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text)" }}>Base de datos interna (SQL Server)</p>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
        Los resultados de cada ejecución quedan guardados automáticamente acá.
      </p>
    </NodeShell>
  );
}
