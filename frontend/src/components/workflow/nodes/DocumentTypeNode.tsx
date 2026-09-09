import type { NodeProps, Node } from "@xyflow/react";
import { FileText } from "lucide-react";
import type { DocumentType } from "../../../api/types";
import { NodeShell } from "./NodeShell";
import { fieldControlStyle, fieldLabelStyle } from "./styles";

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
