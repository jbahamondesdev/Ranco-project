import { useRef, useState } from "react";
import type { NodeProps, Node } from "@xyflow/react";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import type { WorkflowTriggerType } from "../../../api/types";
import { NodeShell } from "./NodeShell";
import { fieldControlStyle, fieldLabelStyle } from "./styles";

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
