import { Columns3, Rows3 } from "lucide-react";
import type { StepperOrientation } from "./WorkflowStepper";

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: active ? "var(--primary-bg)" : "var(--surface)",
    color: active ? "var(--primary)" : "var(--text-muted)",
    cursor: "pointer",
  };
}

export function OrientationToggle({
  value,
  onChange,
}: {
  value: StepperOrientation;
  onChange: (orientation: StepperOrientation) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button type="button" title="Vertical" style={buttonStyle(value === "vertical")} onClick={() => onChange("vertical")}>
        <Rows3 size={15} />
      </button>
      <button
        type="button"
        title="Horizontal"
        style={buttonStyle(value === "horizontal")}
        onClick={() => onChange("horizontal")}
      >
        <Columns3 size={15} />
      </button>
    </div>
  );
}
