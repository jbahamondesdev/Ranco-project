import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { NodeShell, type Tone } from "./nodes";

export type ExecutionNodeStatus = "done" | "active" | "error" | "pending" | "warning";

export interface ExecutionStepNodeData {
  icon: React.ReactNode;
  tone: Tone;
  step: number;
  title: string;
  status: ExecutionNodeStatus;
  summary: string;
  selected: boolean;
  onSelect: () => void;
}

const STATUS_META: Record<ExecutionNodeStatus, { icon: React.ReactNode; color: string; label: string }> = {
  done: { icon: <CheckCircle2 size={13} />, color: "var(--success)", label: "Completado" },
  active: { icon: <Loader2 size={13} className="spin" />, color: "var(--primary)", label: "En curso" },
  error: { icon: <XCircle size={13} />, color: "var(--danger)", label: "Error" },
  warning: { icon: <AlertTriangle size={13} />, color: "var(--warning)", label: "Requiere revisión" },
  pending: { icon: <Circle size={13} />, color: "var(--text-muted)", label: "Pendiente" },
};

export function ExecutionStepNode({ data }: { data: ExecutionStepNodeData }) {
  const meta = STATUS_META[data.status];

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
          border: `2px solid ${meta.color}`,
          color: meta.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {meta.icon}
      </div>
      <NodeShell icon={data.icon} tone={data.tone} step={data.step} title={data.title}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: meta.color, fontSize: 12, fontWeight: 700 }}>
          {meta.label}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)" }}>{data.summary}</p>
      </NodeShell>
    </div>
  );
}
