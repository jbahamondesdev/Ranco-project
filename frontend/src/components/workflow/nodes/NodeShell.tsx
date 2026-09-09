import { Handle, Position } from "@xyflow/react";

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
