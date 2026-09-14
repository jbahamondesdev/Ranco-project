const NODE_WIDTH = 240;

export type Tone = "primary" | "accent" | "warning" | "success";

const TONE_COLORS: Record<Tone, { color: string; bg: string }> = {
  primary: { color: "var(--primary)", bg: "var(--primary-bg)" },
  accent: { color: "var(--accent)", bg: "var(--accent-bg)" },
  warning: { color: "var(--warning)", bg: "var(--warning-bg)" },
  success: { color: "var(--success)", bg: "var(--success-bg)" },
};

export function NodeShell({
  icon,
  tone,
  step,
  title,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  tone: Tone;
  step: number;
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const { color, bg } = TONE_COLORS[tone];
  return (
    <div
      onClick={onClick}
      style={{
        width: NODE_WIDTH,
        flexShrink: 0,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
      }}
    >
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
    </div>
  );
}
