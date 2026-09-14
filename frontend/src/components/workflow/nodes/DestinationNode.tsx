import type { WorkflowDestination } from "../../../api/types";
import { fieldControlStyle, fieldLabelStyle } from "./styles";

// --- 4. Destino ---
export interface DestinationNodeData {
  destination: WorkflowDestination;
  webhookUrl: string;
  onChange: (destination: WorkflowDestination, webhookUrl: string) => void;
}

export function DestinationNode({ data }: { data: DestinationNodeData }) {
  return (
    <>
      <label style={fieldLabelStyle}>Dónde queda el resultado</label>
      <select
        value={data.destination}
        onChange={(e) => data.onChange(e.target.value as WorkflowDestination, data.webhookUrl)}
        style={fieldControlStyle}
      >
        <option value="internal_db">Base de datos interna</option>
        <option value="webhook">Webhook (POST a una URL)</option>
      </select>

      {data.destination === "internal_db" && (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
          Los resultados de cada ejecución quedan guardados automáticamente acá.
        </p>
      )}

      {data.destination === "webhook" && (
        <>
          <label style={{ ...fieldLabelStyle, marginTop: 10 }}>URL del webhook</label>
          <input
            type="url"
            placeholder="https://..."
            value={data.webhookUrl}
            onChange={(e) => data.onChange(data.destination, e.target.value)}
            style={fieldControlStyle}
          />
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
            Se envía un POST con el resultado (JSON) al terminar cada ejecución — funciona con un Incoming
            Webhook de Slack/Teams, Zapier, o un endpoint propio.
          </p>
        </>
      )}
    </>
  );
}
