import { Loader2 } from "lucide-react";

export function Spinner({ size = 20, center }: { size?: number; center?: boolean }) {
  const icon = <Loader2 size={size} className="spin" style={{ color: "var(--text-muted)" }} />;

  if (!center) return icon;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
      {icon}
    </div>
  );
}
