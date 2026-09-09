import type { NodeProps, Node } from "@xyflow/react";
import { Database } from "lucide-react";
import { NodeShell } from "./NodeShell";

// --- 4. Destino ---
export type DestinationNodeData = Record<string, unknown>;
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
