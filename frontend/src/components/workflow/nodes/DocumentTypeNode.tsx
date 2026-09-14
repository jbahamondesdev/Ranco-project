import type { DocumentType } from "../../../api/types";
import { fieldControlStyle, fieldLabelStyle } from "./styles";

// --- 2. Tipo de documento ---
export interface DocumentTypeNodeData {
  documentTypeId: string | null;
  documentTypes: DocumentType[];
  onChange: (id: string | null) => void;
}

export function DocumentTypeNode({ data }: { data: DocumentTypeNodeData }) {
  return (
    <>
      <label style={fieldLabelStyle}>Qué extraer</label>
      <select
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
    </>
  );
}
