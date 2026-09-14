import { CheckCircle2, Circle } from "lucide-react";
import { NodeShell, type Tone } from "./nodes";

export interface EditorStepNodeData {
  icon: React.ReactNode;
  tone: Tone;
  step: number;
  title: string;
  summary: string;
  complete: boolean;
  selected: boolean;
  onSelect: () => void;
}

// Tarjeta compacta y clickeable de un paso del editor de workflow - análoga a
// ExecutionStepNode (misma idea de círculo de estado + resaltado al seleccionar),
// pero para configuración en vez de resultado de una ejecución. Al hacer clic se abre
// el panel lateral (ver WorkflowStepPanel) con los campos reales de ese paso, en vez
// de tenerlos todos abiertos a la vez dentro de la tarjeta.
export function EditorStepNode({ data }: { data: EditorStepNodeData }) {
  return (
    <div
      onClick={data.onSelect}
      style={{
        position: "relative",
        borderRadius: 16,
        cursor: "pointer",
        outline: data.selected ? "2px solid var(--primary)" : "2px solid transparent",
        outlineOffset: 3,
        transition: "outline-color 0.12s",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -7,
          right: -7,
          zIndex: 5,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--surface)",
          border: `2px solid ${data.complete ? "var(--success)" : "var(--text-muted)"}`,
          color: data.complete ? "var(--success)" : "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {data.complete ? <CheckCircle2 size={13} /> : <Circle size={13} />}
      </div>
      <NodeShell icon={data.icon} tone={data.tone} step={data.step} title={data.title}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{data.summary}</p>
      </NodeShell>
    </div>
  );
}
